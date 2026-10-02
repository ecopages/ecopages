import {
	findCommentEnd,
	isAsciiAlpha,
	matchTag,
	parseStartTag,
	RAW_TEXT_ELEMENTS,
	readTagName,
	scanTag,
	VOID_ELEMENTS,
} from './html-tokenizer.ts';

/**
 * Positional HTML parser for callers that splice the original markup.
 *
 * @remarks
 * `HtmlRewriter` streams and never reports source offsets. This parser shares
 * its tokenizer, so tags, comments, and raw text are recognised the same way,
 * but builds only a light tree: an end tag closes the nearest open element with
 * the same name, a `<body>` start tag, an element that cannot appear in
 * `<head>`, or non-whitespace text closes an open `<head>`, and self-closing
 * syntax closes any element so SVG children such as `<path />` do not nest.
 * Script content ends at the first `</script>`; script escape states are not
 * followed.
 */

export type HtmlAttribute = {
	/** Lowercased attribute name. */
	name: string;
	/** Value with character references decoded; `''` when the attribute has no value. */
	value: string;
	/** Value as written, without its quotes. */
	rawValue: string;
	/** Start of the raw value, including its quotes; equals `valueEnd` when there is no value. */
	valueStart: number;
	valueEnd: number;
};

export type HtmlElementNode = {
	type: 'element';
	/** Lowercased tag name. */
	tagName: string;
	attributes: HtmlAttribute[];
	start: number;
	startTagEnd: number;
	/** Start of the end tag, or `end` when the element was closed implicitly. */
	contentEnd: number;
	end: number;
	children: HtmlNode[];
};

export type HtmlLeafNode = {
	type: 'text' | 'comment' | 'doctype';
	start: number;
	end: number;
};

export type HtmlNode = HtmlElementNode | HtmlLeafNode;

/** Elements that can stay inside `<head>`; any other start tag there ends it, as `</head>` may be omitted. */
const HEAD_CONTENT_ELEMENTS = new Set(['base', 'link', 'meta', 'noscript', 'script', 'style', 'template', 'title']);

const NAMED_CHARACTER_REFERENCES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

/**
 * Decodes numeric and the common named character references.
 *
 * @remarks
 * Callers read titles, metadata, and URLs through this, so the full named
 * reference table is not worth carrying.
 */
export function decodeHtmlEntities(value: string): string {
	return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (reference, body: string) => {
		if (body[0] === '#') {
			const codePoint =
				body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
		}
		return NAMED_CHARACTER_REFERENCES[body.toLowerCase()] ?? reference;
	});
}

function findLastOpen(openElements: readonly HtmlElementNode[], tagName: string): number {
	for (let position = openElements.length - 1; position >= 0; position--) {
		if (openElements[position]!.tagName === tagName) return position;
	}
	return -1;
}

/** Returns the start of the end tag that closes raw text opened by `tagName`, or `-1`. */
function findRawTextEnd(source: string, from: number, tagName: string): number {
	if (tagName === 'plaintext') return -1;
	const endTag = `</${tagName}`;
	for (let lt = source.indexOf('<', from); lt !== -1; lt = source.indexOf('<', lt + 1)) {
		if (matchTag(source, lt, endTag, true) === 'yes') return lt;
	}
	return -1;
}

function tagEnd(source: string, index: number): number {
	const close = source.indexOf('>', index);
	return close === -1 ? source.length : close + 1;
}

/**
 * Builds the node tree for one {@link parseHtml} call.
 */
class HtmlTreeBuilder {
	readonly root: HtmlNode[] = [];
	private readonly source: string;
	private readonly openElements: HtmlElementNode[] = [];
	private textStart = 0;

	constructor(source: string) {
		this.source = source;
	}

	/** Consumes the markup that starts with `<` at `lt` and returns where scanning resumes. */
	read(lt: number): number {
		const { source } = this;
		const next = source[lt + 1];

		if (source.startsWith('<!--', lt)) {
			const end = findCommentEnd(source, lt);
			return this.appendLeaf('comment', lt, end === -1 ? source.length : end);
		}
		if (next === '!' || next === '?') {
			const isDoctype = source.slice(lt + 2, lt + 9).toLowerCase() === 'doctype';
			return this.appendLeaf(isDoctype ? 'doctype' : 'comment', lt, tagEnd(source, lt));
		}
		if (next === '/') {
			return isAsciiAlpha(source[lt + 2] ?? '')
				? this.readEndTag(lt)
				: this.appendLeaf('comment', lt, tagEnd(source, lt));
		}
		return isAsciiAlpha(next ?? '') ? this.readStartTag(lt) : lt + 1;
	}

	finish(): HtmlNode[] {
		this.flushText(this.source.length);
		this.closeOpenElementsFrom(0, this.source.length);
		return this.root;
	}

	private append(node: HtmlNode): void {
		(this.openElements[this.openElements.length - 1]?.children ?? this.root).push(node);
	}

	/**
	 * @remarks
	 * Non-whitespace text cannot stay in `<head>`, so it ends an open head at its
	 * first character, as `</head>` may be omitted.
	 */
	private flushText(end: number): void {
		if (end <= this.textStart) return;
		const current = this.openElements[this.openElements.length - 1];
		const firstText = current?.tagName === 'head' ? this.source.slice(this.textStart, end).search(/\S/) : -1;
		if (firstText !== -1) {
			const headEnd = this.textStart + firstText;
			if (headEnd > this.textStart) this.append({ type: 'text', start: this.textStart, end: headEnd });
			this.closeOpenElementsFrom(this.openElements.length - 1, headEnd);
			this.textStart = headEnd;
		}
		this.append({ type: 'text', start: this.textStart, end });
	}

	private closeOpenElementsFrom(position: number, at: number): void {
		for (const element of this.openElements.splice(position)) {
			element.contentEnd = at;
			element.end = at;
		}
	}

	private appendLeaf(type: HtmlLeafNode['type'], start: number, end: number): number {
		this.flushText(start);
		this.append({ type, start, end });
		return (this.textStart = end);
	}

	private readEndTag(lt: number): number {
		this.flushText(lt);
		const tag = scanTag(this.source, lt);
		const end = tag ? tag.end + 1 : this.source.length;
		const position = findLastOpen(this.openElements, readTagName(this.source, lt + 2).toLowerCase());
		if (position !== -1) {
			this.closeOpenElementsFrom(position + 1, lt);
			const element = this.openElements.pop()!;
			element.contentEnd = lt;
			element.end = end;
		}
		return (this.textStart = end);
	}

	private readStartTag(lt: number): number {
		const tag = scanTag(this.source, lt);
		if (!tag) return lt + 1;

		this.flushText(lt);
		const startTagEnd = tag.end + 1;
		const { rawName, attributes } = parseStartTag(this.source.slice(lt, startTagEnd));
		const tagName = rawName.toLowerCase();
		const current = this.openElements[this.openElements.length - 1];
		if (tagName === 'body' || (current?.tagName === 'head' && !HEAD_CONTENT_ELEMENTS.has(tagName))) {
			const headPosition = findLastOpen(this.openElements, 'head');
			if (headPosition !== -1) this.closeOpenElementsFrom(headPosition, lt);
		}

		const element: HtmlElementNode = {
			type: 'element',
			tagName,
			attributes: attributes.map((attribute) => ({
				name: attribute.name,
				value: decodeHtmlEntities(attribute.value),
				rawValue: attribute.value,
				valueStart: lt + attribute.valueStart,
				valueEnd: lt + attribute.start + attribute.source.length,
			})),
			start: lt,
			startTagEnd,
			contentEnd: startTagEnd,
			end: startTagEnd,
			children: [],
		};
		this.append(element);
		this.textStart = startTagEnd;

		if (VOID_ELEMENTS.has(tagName) || tag.selfClosing) return startTagEnd;
		if (!RAW_TEXT_ELEMENTS.has(tagName)) {
			this.openElements.push(element);
			return startTagEnd;
		}
		return this.readRawText(element);
	}

	private readRawText(element: HtmlElementNode): number {
		const contentEnd = findRawTextEnd(this.source, element.startTagEnd, element.tagName);
		element.contentEnd = contentEnd === -1 ? this.source.length : contentEnd;
		element.end = contentEnd === -1 ? this.source.length : tagEnd(this.source, contentEnd);
		if (element.contentEnd > element.startTagEnd) {
			element.children.push({ type: 'text', start: element.startTagEnd, end: element.contentEnd });
		}
		return (this.textStart = element.end);
	}
}

/**
 * Parses `source` into a light node tree with source offsets.
 */
export function parseHtml(source: string): HtmlNode[] {
	const builder = new HtmlTreeBuilder(source);
	for (let lt = source.indexOf('<'); lt !== -1 && lt < source.length - 1; lt = source.indexOf('<', lt)) {
		lt = builder.read(lt);
	}
	return builder.finish();
}

/**
 * Visits element nodes depth first in source order.
 */
export function walkElements(nodes: readonly HtmlNode[], visit: (element: HtmlElementNode) => void): void {
	for (const node of nodes) {
		if (node.type !== 'element') continue;
		visit(node);
		walkElements(node.children, visit);
	}
}

export function findElements(
	nodes: readonly HtmlNode[],
	predicate: (element: HtmlElementNode) => boolean,
): HtmlElementNode[] {
	const matches: HtmlElementNode[] = [];
	walkElements(nodes, (element) => {
		if (predicate(element)) matches.push(element);
	});
	return matches;
}

export function getAttribute(element: HtmlElementNode, name: string): HtmlAttribute | undefined {
	return element.attributes.find((attribute) => attribute.name === name);
}

/** Returns the markup between an element's start and end tags. */
export function getElementText(source: string, element: HtmlElementNode): string {
	return source.slice(element.startTagEnd, element.contentEnd);
}
