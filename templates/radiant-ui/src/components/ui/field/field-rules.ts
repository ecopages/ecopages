/**
 * SSR round-trip for `FieldRules.pattern`.
 *
 * `rui-field` reflects `rules` as JSON. `JSON.stringify` turns a `RegExp` into
 * `{}`, and the form resolver then calls `.test` on that object — so an email
 * (or any `pattern`) rule never runs after hydrate. Encode the source/flags
 * before paint, revive a real `RegExp` when the field script connects.
 */
import type { FieldRules } from '@ecopages/radiant-ui/form';

type PatternSource = {
	source: string;
	flags: string;
};

function isPatternSource(value: unknown): value is PatternSource {
	return (
		typeof value === 'object' &&
		value !== null &&
		!('test' in value) &&
		'source' in value &&
		typeof (value as PatternSource).source === 'string'
	);
}

function encodePattern(value: RegExp | PatternSource): PatternSource {
	if (value instanceof RegExp) {
		return { source: value.source, flags: value.flags };
	}

	return value;
}

function revivePattern(value: unknown): RegExp | unknown {
	if (value instanceof RegExp) return value;
	if (!isPatternSource(value)) return value;

	return new RegExp(value.source, value.flags);
}

/**
 * JSON-safe `rules` for the `rui-field` attribute and hydration payload.
 *
 * @remarks
 * The return type stays `FieldRules` so it can pass through `prop:rules`. The
 * encoded `pattern` is `{ source, flags }`, not a `RegExp` — `reviveFieldRules`
 * restores the real regex in the browser.
 */
export function encodeFieldRules(rules?: FieldRules): FieldRules | undefined {
	if (!rules?.pattern) return rules;

	const { pattern, ...rest } = rules;
	if (pattern instanceof RegExp) {
		return { ...rest, pattern: encodePattern(pattern) as unknown as RegExp };
	}

	if (typeof pattern === 'object' && pattern !== null && 'value' in pattern) {
		return {
			...rest,
			pattern: {
				value: encodePattern(pattern.value) as unknown as RegExp,
				message: pattern.message,
			},
		};
	}

	return rules;
}

/**
 * Restores `pattern` to a `RegExp` on the live `rules` object.
 *
 * Mutates in place so the host's `@prop` reference stays the one it registered.
 */
export function reviveFieldRules(rules: FieldRules | undefined): void {
	if (!rules?.pattern) return;

	const pattern = rules.pattern;
	if (pattern instanceof RegExp) return;

	if (typeof pattern === 'object' && pattern !== null && 'value' in pattern) {
		const revived = revivePattern(pattern.value);
		if (revived instanceof RegExp) {
			(pattern as { value: RegExp }).value = revived;
		}
		return;
	}

	const revived = revivePattern(pattern);
	if (revived instanceof RegExp) {
		rules.pattern = revived;
	}
}
