/**
 * HTML lexing primitives shared by the streaming `HtmlRewriter` and the
 * positional HTML source parser.
 *
 * @remarks
 * Both follow lol-html on the rules collected here, so a tag, comment, or
 * raw-text boundary is recognised the same way whether markup is rewritten in a
 * stream or parsed with source offsets.
 *
 * @module
 */

export type HtmlStartTagAttribute = {
	/** Lowercased attribute name. */
	name: string;
	rawName: string;
	/** Value as written, without its quotes. */
	value: string;
	/** Original text from the attribute name through its value. */
	source: string;
	/** Offset of the attribute name within the start tag. */
	start: number;
	/**
	 * Offset of the value within the start tag, including its opening quote.
	 *
	 * @remarks Equals `start + source.length` when the attribute has no value.
	 */
	valueStart: number;
};

type HtmlStartTag = { rawName: string; attributes: HtmlStartTagAttribute[] };

export type Match = 'yes' | 'no' | 'more';

export const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'keygen',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

export const RAW_TEXT_ELEMENTS = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'noscript',
	'iframe',
	'xmp',
	'noembed',
	'noframes',
	'plaintext',
]);

/**
 * Parses the start tag `raw` (from `<` through `>`) into its name and attributes.
 *
 * @remarks
 * Attribute values are returned as written, without decoding character references.
 */
export function parseStartTag(raw: string): HtmlStartTag {
	const rawName = readTagName(raw, 1);
	const attributes: HtmlStartTagAttribute[] = [];
	let index = 1 + rawName.length;

	while (index < raw.length) {
		index = skipWhile(raw, index, (char, at) => isWhitespace(char) || (char === '/' && raw[at + 1] !== '>'));
		if (index >= raw.length || raw[index] === '>' || raw.startsWith('/>', index)) {
			return { rawName, attributes };
		}

		const nameStart = index;
		index = skipWhile(
			raw,
			index,
			(char, at) => !isWhitespace(char) && char !== '=' && char !== '>' && !raw.startsWith('/>', at),
		);
		const attributeName = raw.slice(nameStart, index);
		const value = readAttributeValue(raw, index);
		index = value.end;

		attributes.push({
			name: attributeName.toLowerCase(),
			value: value.text,
			source: raw.slice(nameStart, index),
			rawName: attributeName,
			start: nameStart,
			valueStart: value.start,
		});
	}

	return { rawName, attributes };
}

/**
 * Reads an optional `= value` after an attribute name.
 *
 * @remarks `start` and `end` stay at `index` when there is no `=`; otherwise
 * `start` is the opening quote or first value character.
 */
function readAttributeValue(raw: string, index: number): { text: string; start: number; end: number } {
	let position = skipWhile(raw, index, isWhitespace);
	if (raw[position] !== '=') return { text: '', start: index, end: index };

	position = skipWhile(raw, position + 1, isWhitespace);
	const quote = raw[position];
	if (quote === '"' || quote === "'") {
		const close = raw.indexOf(quote, position + 1);
		const valueEnd = close === -1 ? raw.length - 1 : close;
		return { text: raw.slice(position + 1, valueEnd), start: position, end: close === -1 ? valueEnd : close + 1 };
	}

	const valueEnd = skipWhile(raw, position, (char) => !isWhitespace(char) && char !== '>');
	return { text: raw.slice(position, valueEnd), start: position, end: valueEnd };
}

function skipWhile(raw: string, index: number, predicate: (char: string, at: number) => boolean): number {
	let position = index;
	while (position < raw.length && predicate(raw[position], position)) position++;
	return position;
}

/**
 * Finds the end of a comment opened at `index`.
 *
 * @remarks Accepts `-->` and `--!>`, including the abrupt `<!-->` and `<!--->`.
 */
export function findCommentEnd(source: string, index: number): number {
	for (let close = source.indexOf('>', index + 4); close !== -1; close = source.indexOf('>', close + 1)) {
		if (source[close - 1] === '-' && source[close - 2] === '-') return close + 1;
		if (
			source[close - 1] === '!' &&
			source[close - 2] === '-' &&
			source[close - 3] === '-' &&
			close - 3 >= index + 4
		) {
			return close + 1;
		}
	}
	return -1;
}

/**
 * Scans a start or end tag from `index` to its closing `>`, skipping quoted
 * attribute values.
 *
 * @remarks `selfClosing` is true only when the `/` before `>` is not part of an
 * unquoted attribute value (`<div a=/>` is not self-closing).
 */
export function scanTag(source: string, index: number): { end: number; selfClosing: boolean } | null {
	let position = index + 1;
	while (position < source.length && !isTagNameEnd(source[position])) position++;

	let afterEquals = false;
	let inUnquotedValue = false;
	for (; position < source.length; position++) {
		const code = source.charCodeAt(position);
		if (code === CHAR_GREATER_THAN) {
			return { end: position, selfClosing: source.charCodeAt(position - 1) === CHAR_SLASH && !inUnquotedValue };
		}
		if (isWhitespaceCode(code)) {
			inUnquotedValue = false;
			continue;
		}
		if (afterEquals) {
			afterEquals = false;
			if (code === CHAR_DOUBLE_QUOTE || code === CHAR_SINGLE_QUOTE) {
				position = source.indexOf(source[position], position + 1);
				if (position === -1) return null;
			} else {
				inUnquotedValue = true;
			}
			continue;
		}
		if (code === CHAR_EQUALS && !inUnquotedValue) afterEquals = true;
	}
	return null;
}

export function readTagName(raw: string, from: number): string {
	let end = from;
	while (end < raw.length && !isTagNameEnd(raw[end])) end++;
	return raw.slice(from, end);
}

/**
 * Matches `prefix` case-insensitively at `index`, followed by a tag-name
 * delimiter. Returns `'more'` when the input ends before the match is decided.
 */
export function matchTag(source: string, index: number, prefix: string, final: boolean): Match {
	const available = source.slice(index, index + prefix.length).toLowerCase();
	if (available.length < prefix.length) return !final && prefix.startsWith(available) ? 'more' : 'no';
	if (available !== prefix) return 'no';
	const delimiter = source[index + prefix.length];
	if (delimiter === undefined) return final ? 'no' : 'more';
	return isTagNameEnd(delimiter) ? 'yes' : 'no';
}

export function isAsciiAlpha(char: string): boolean {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

function isWhitespace(char: string): boolean {
	return char === ' ' || char === '\n' || char === '\t' || char === '\r' || char === '\f';
}

const CHAR_DOUBLE_QUOTE = 34;
const CHAR_SINGLE_QUOTE = 39;
const CHAR_SLASH = 47;
const CHAR_EQUALS = 61;
const CHAR_GREATER_THAN = 62;

/** {@link isWhitespace} for a UTF-16 code unit, for the hot tag scanner. */
export function isWhitespaceCode(code: number): boolean {
	return code === 32 || code === 10 || code === 9 || code === 13 || code === 12;
}

function isTagNameEnd(char: string): boolean {
	return isWhitespace(char) || char === '/' || char === '>';
}
