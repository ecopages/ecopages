import type { EcoComponent } from '../../types/public-types.ts';
import { buildInjectorMapScript } from '../../eco/lazy-injector-map.ts';

/**
 * Returns `true` when `value` is a thenable (Promise-like) object.
 *
 * Used to transparently handle both synchronous and asynchronous component
 * render results without requiring every caller to branch on `instanceof Promise`.
 *
 * @typeParam T Expected resolved type of the thenable.
 */
export function isThenable<T>(value: unknown): value is PromiseLike<T> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'then' in value &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

/**
 * Injects `data-eco-trigger` into the first real HTML element opening tag of
 * a component's rendered output string.
 *
 * The scan skips over leading whitespace, HTML comments (`<!-- -->`), CDATA
 * sections, and doctype declarations so that the attribute is always placed on
 * the first actual element — not spurious markup that can precede it.
 *
 * The insertion point is the end of the element's tag name, before any existing
 * attributes or the closing `>`, which produces output like:
 *
 * ```html
 * <my-element data-eco-trigger="eco-trigger-abc123" class="foo">…</my-element>
 * ```
 *
 * When no eligible opening tag is found the original string is returned
 * unchanged so callers never receive a broken fragment.
 *
 * @param content Rendered HTML string (or any value coercible to string).
 * @param triggerId Stable trigger identifier produced by `buildResolvedLazyTriggers`.
 */
export function addTriggerAttribute(content: unknown, triggerId: string): string {
	const str = String(content);
	let i = 0;

	while (i < str.length) {
		if (str[i] !== '<') {
			i++;
			continue;
		}

		const next = str[i + 1];

		if (next === '!' || next === '?') {
			const end = str.indexOf('>', i);
			if (end === -1) break;
			i = end + 1;
			continue;
		}

		if (next && /[a-zA-Z]/.test(next)) {
			const tagSlice = str.slice(i + 1);
			const nameEnd = tagSlice.search(/[\s/>]/);
			if (nameEnd === -1) break;
			const insertAt = i + 1 + nameEnd;
			return `${str.slice(0, insertAt)} data-eco-trigger="${triggerId}"${str.slice(insertAt)}`;
		}

		break;
	}

	return str;
}

/**
 * Wraps rendered component output in a `<scripts-injector>` element that
 * carries an inline injector map for the legacy (non-global-injector) path.
 *
 * @param content Rendered component HTML.
 * @param lazyGroups Resolved lazy script groups attached to the component config.
 */
export function wrapWithScriptsInjector(
	content: unknown,
	lazyGroups: NonNullable<EcoComponent['config']>['_resolvedLazyScripts'],
): string {
	const wrappedContent = String(content);
	const injectorMapScript = buildInjectorMapScript(lazyGroups ?? []);
	return `<scripts-injector><script type="ecopages/injector-map">${injectorMapScript}</script>${wrappedContent}</scripts-injector>`;
}