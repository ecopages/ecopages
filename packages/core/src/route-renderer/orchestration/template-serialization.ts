import { escapeHtmlAttribute } from '../../utils/html-escaping.ts';

/**
 * Minimal template-result shape that core can serialize generically.
 *
 * @remarks
 * Core intentionally models only the transport shape used during deferred
 * cross-integration child passing: alternating static string segments plus
 * interpolated runtime values. Concrete runtime markers that identify a given
 * framework's template payload must stay outside core and be registered by the
 * owning integration package.
 */
export type SerializableTemplateShape = {
	strings: readonly string[];
	values?: readonly unknown[];
};

/**
 * Parsed attribute metadata for one template string segment.
 *
 * `serializeTemplateShape()` uses this to decide whether the next interpolated
 * value should be emitted as raw HTML content, a quoted attribute value, a
 * boolean attribute, or omitted entirely for client-only bindings.
 */
type SerializableTemplateAttribute = {
	leading: string;
	name: string;
	prefix: string;
	whitespace: string;
};

/**
 * Integration-owned adapter that teaches core how to serialize one deferred
 * template payload shape.
 *
 * @remarks
 * The separation here is intentional: core owns the HTML serialization logic,
 * but integrations own runtime-shape detection. That keeps package-specific
 * markers such as framework template sentinels out of core while still letting
 * deferred children round-trip through mixed renderer boundaries.
 */
export type DeferredTemplateSerializer<TTemplate extends SerializableTemplateShape = SerializableTemplateShape> = {
	matches(value: unknown): value is TTemplate;
	serialize(template: TTemplate, serializeValue: (value: unknown) => string | undefined): string;
};

const ATTRIBUTE_TAIL_PATTERN = /(\s+)([@.?!]?)([^\s"'<>/=`@.?!]+)=$/;

/**
 * Detects whether the current string segment ends in an HTML attribute binding.
 *
	 * The parser is intentionally small: it only recognizes the transport shape
 * Ecopages needs during deferred mixed-integration rendering, not a full HTML
 * grammar.
 */
function getSerializableTemplateAttribute(stringPart: string): SerializableTemplateAttribute | undefined {
	const match = ATTRIBUTE_TAIL_PATTERN.exec(stringPart);
	if (!match) return undefined;

	return {
		leading: stringPart.slice(0, match.index),
		whitespace: match[1],
		prefix: match[2],
		name: match[3],
	};
}

/**
 * Serializes a generic template shape into HTML.
 *
 * @remarks
 * This handles only HTML reconstruction semantics: quoted attribute values,
 * boolean attributes, and omission of client-only event or property bindings.
 * It does not decide whether an arbitrary value belongs to a framework-specific
 * template runtime; integrations must make that decision before delegating here.
 */
export function serializeTemplateShape(
	template: SerializableTemplateShape,
	serializeValue: (value: unknown) => string | undefined,
): string {
	const values = template.values ?? [];
	let html = '';

	for (let index = 0; index < values.length; index += 1) {
		const stringPart = template.strings[index] ?? '';
		const serializedValue = serializeValue(values[index]);
		const attribute = getSerializableTemplateAttribute(stringPart);

		if (!attribute) {
			html += stringPart;
			html += serializedValue ?? '';
			continue;
		}

		html += attribute.leading;

		if (attribute.prefix === '@' || attribute.prefix === '!' || attribute.prefix === '.') {
			continue;
		}

		if (attribute.prefix === '?') {
			if (serializedValue) {
				html += `${attribute.whitespace}${attribute.name}`;
			}
			continue;
		}

		if (serializedValue === undefined) {
			continue;
		}

		html += `${attribute.whitespace}${attribute.name}="${escapeHtmlAttribute(serializedValue)}"`;
	}

	html += template.strings[values.length] ?? '';
	return html;
}
