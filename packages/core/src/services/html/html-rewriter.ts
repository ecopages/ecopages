export type HtmlContentOptions = {
	/** Insert `content` as raw markup. Otherwise it is inserted as escaped text. */
	html?: boolean;
};

/**
 * Element passed to {@link HtmlRewriterElementHandlers.element}; a subset of Bun's
 * `HTMLRewriter` element API.
 */
export interface HtmlRewriterElement {
	/** Lowercased tag name. */
	readonly tagName: string;
	/** Attribute name/value pairs, names lowercased. */
	readonly attributes: IterableIterator<[string, string]>;
	readonly selfClosing: boolean;
	/** `false` for void elements (and self-closing foreign elements), which ignore `prepend`/`append`. */
	readonly canHaveContent: boolean;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	setAttribute(name: string, value: string): HtmlRewriterElement;
	removeAttribute(name: string): HtmlRewriterElement;
	before(content: string, options?: HtmlContentOptions): HtmlRewriterElement;
	/** Inserts right after the start tag; repeated calls insert in reverse call order. */
	prepend(content: string, options?: HtmlContentOptions): HtmlRewriterElement;
	/** Inserts right before the end tag; dropped when the element never closes. */
	append(content: string, options?: HtmlContentOptions): HtmlRewriterElement;
	/** Inserts after the end tag in reverse call order; dropped when the element never closes. */
	after(content: string, options?: HtmlContentOptions): HtmlRewriterElement;
}

export interface HtmlRewriterElementHandlers {
	element?(element: HtmlRewriterElement): void;
}

/**
 * Streaming HTML rewriter implementing the subset of Bun's `HTMLRewriter` API that
 * Ecopages uses, so the same rewrite runs on Bun and Node without a wasm build of
 * lol-html.
 *
 * @remarks
 * Supported selectors are tag names and `*`; anything else throws so an
 * unsupported selector never silently matches nothing. Handlers are synchronous.
 *
 * Output follows lol-html (checked against Bun's native `HTMLRewriter`) on the
 * behaviour Ecopages relies on: comments, doctypes and the content of raw-text
 * elements (`script` with its escape states, `style`, `textarea`, `title`,
 * `noscript`, `iframe`, `xmp`, `noembed`, `noframes`, `plaintext`) never produce
 * tags; `>` inside quoted attribute values does not end a tag; tag matching is
 * case-insensitive; untouched attributes keep their original text.
 *
 * There is no tree construction. An end tag closes the nearest open element with
 * the same name, and `append`/`after` content of elements that it closes
 * implicitly, or that are still open at the end of the document, is dropped.
 */
export class HtmlRewriter {
	private readonly handlers: SelectorHandlers[] = [];

	on(selector: string, handlers: HtmlRewriterElementHandlers): this {
		const tagName = selector.trim().toLowerCase();
		if (tagName !== '*' && !/^[a-z][a-z0-9-]*$/.test(tagName)) {
			throw new Error(`HtmlRewriter supports tag-name and "*" selectors only; got "${selector}".`);
		}
		this.handlers.push({ tagName, handlers });
		return this;
	}

	transform(input: string): string;
	transform(input: Response): Response;
	transform(input: string | Response): string | Response {
		if (typeof input === 'string') {
			const session = new RewriteSession(this.handlers);
			return `${session.write(input)}${session.end()}`;
		}

		const headers = new Headers(input.headers);
		headers.delete('content-length');
		const init = { status: input.status, statusText: input.statusText, headers };
		if (!input.body) {
			return new Response(null, init);
		}

		const session = new RewriteSession(this.handlers);
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();
		const body = input.body.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					const output = session.write(decoder.decode(chunk, { stream: true }));
					if (output) controller.enqueue(encoder.encode(output));
				},
				flush(controller) {
					const output = `${session.write(decoder.decode())}${session.end()}`;
					if (output) controller.enqueue(encoder.encode(output));
				},
			}),
		);
		return new Response(body, init);
	}
}

type SelectorHandlers = { tagName: string; handlers: HtmlRewriterElementHandlers };

type OpenElement = { name: string; foreign: boolean; append: string; after: string };

type ScanResult = { textEnd: number; closed: boolean };

type MarkupToken = { output: string; end: number };

/** Extra characters consumed past the current script position, or a scan outcome. */
type ScriptStep = number | 'more' | 'closed';

type Match = 'yes' | 'no' | 'more';

const VOID_ELEMENTS = new Set([
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

/** SVG and MathML elements whose children are parsed as HTML again. */
const HTML_INTEGRATION_POINTS = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext']);

/** HTML start tags that end foreign (SVG or MathML) content. */
const FOREIGN_BREAKOUT_TAGS = new Set([
	'b',
	'big',
	'blockquote',
	'body',
	'br',
	'center',
	'code',
	'dd',
	'div',
	'dl',
	'dt',
	'em',
	'embed',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'hr',
	'i',
	'img',
	'li',
	'listing',
	'menu',
	'meta',
	'nobr',
	'ol',
	'p',
	'pre',
	'ruby',
	's',
	'small',
	'span',
	'strong',
	'strike',
	'sub',
	'sup',
	'table',
	'tt',
	'u',
	'ul',
	'var',
]);

const RAW_TEXT_ELEMENTS = new Set([
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
 * Incremental tokenizer state for one `transform()` call.
 *
 * @remarks
 * `write()` consumes as much input as can be tokenized unambiguously and keeps
 * the rest (an unfinished tag, comment, or possible raw-text end tag) buffered
 * for the next chunk. `end()` flushes that remainder as-is.
 *
 * Foreign content follows lol-html: SVG and MathML children are foreign until an
 * HTML integration point or a break-out start tag, and CDATA sections are
 * recognised only in foreign content. Break-out end tags (`</p>`, `</br>`)
 * are not modelled.
 */
class RewriteSession {
	private buffer = '';
	private rawTextTag: string | null = null;
	private scriptState: 'data' | 'escaped' | 'double-escaped' = 'data';
	private readonly openElements: OpenElement[] = [];
	private readonly handlers: SelectorHandlers[];

	constructor(handlers: SelectorHandlers[]) {
		this.handlers = handlers;
	}

	write(chunk: string): string {
		this.buffer += chunk;
		return this.drain(false);
	}

	end(): string {
		const output = this.drain(true);
		this.openElements.length = 0;
		return output;
	}

	private drain(final: boolean): string {
		const source = this.buffer;
		let output = '';
		let index = 0;

		while (index < source.length) {
			if (this.rawTextTag) {
				const scan =
					this.rawTextTag === 'script'
						? this.scanScript(source, index, final)
						: this.scanRawText(source, index, final);
				output += source.slice(index, scan.textEnd);
				index = scan.textEnd;
				if (!scan.closed) break;
				this.rawTextTag = null;
				continue;
			}

			const lt = source.indexOf('<', index);
			if (lt === -1) {
				output += source.slice(index);
				index = source.length;
				break;
			}
			output += source.slice(index, lt);
			index = lt;

			const token = this.readMarkup(source, index, final);
			if (!token) break;
			output += token.output;
			index = token.end;
		}

		if (final) {
			output += source.slice(index);
			this.buffer = '';
		} else {
			this.buffer = source.slice(index);
		}
		return output;
	}

	private readMarkup(source: string, index: number, final: boolean): MarkupToken | null {
		const next = source[index + 1];
		if (next === undefined) return null;
		if (next === '!') return readDeclaration(source, index, final, this.inForeignContent());
		if (next === '?') return readUntilTagClose(source, index);
		if (next === '/') return this.readEndTag(source, index);
		if (!isAsciiAlpha(next)) return { output: '<', end: index + 1 };

		const tag = scanTag(source, index);
		if (!tag) return null;
		return { output: this.openElement(source.slice(index, tag.end + 1), tag.selfClosing), end: tag.end + 1 };
	}

	private readEndTag(source: string, index: number): MarkupToken | null {
		const first = source[index + 2];
		if (first === undefined) return null;
		if (first === '>') return { output: '</>', end: index + 3 };
		if (!isAsciiAlpha(first)) return readUntilTagClose(source, index);

		const tag = scanTag(source, index);
		if (!tag) return null;
		const raw = source.slice(index, tag.end + 1);
		return { output: this.closeElement(readTagName(raw, 2).toLowerCase(), raw), end: tag.end + 1 };
	}

	private inForeignContent(): boolean {
		const current = this.openElements[this.openElements.length - 1];
		return current !== undefined && current.foreign && !HTML_INTEGRATION_POINTS.has(current.name);
	}

	/**
	 * Resolves whether a new element is SVG/MathML.
	 *
	 * @remarks
	 * A break-out start tag implicitly closes the open foreign elements, so their
	 * pending `append`/`after` content is dropped, as for any element closed
	 * without its own end tag.
	 */
	private resolveForeign(name: string, raw: string): boolean {
		if (name === 'svg' || name === 'math') return true;
		if (!this.inForeignContent()) return false;
		if (!isForeignBreakout(name, raw)) return true;

		while (this.inForeignContent()) this.openElements.pop();
		return false;
	}

	private openElement(raw: string, selfClosing: boolean): string {
		const name = readTagName(raw, 1).toLowerCase();
		const foreign = this.resolveForeign(name, raw);
		const isVoid = VOID_ELEMENTS.has(name) || (foreign && selfClosing);
		const openElement: OpenElement = { name, foreign, append: '', after: '' };
		let output = raw;

		const matching = this.handlers.filter((entry) => entry.tagName === '*' || entry.tagName === name);
		if (matching.length > 0) {
			const element = new RewriterElement(raw, name, selfClosing, !isVoid);
			for (const entry of matching) entry.handlers.element?.(element);
			output = element.renderStart();
			openElement.append = element.renderAppend();
			openElement.after = element.renderAfter();
			if (isVoid) output += openElement.after;
		}

		if (!isVoid) {
			this.openElements.push(openElement);
			if (!foreign && RAW_TEXT_ELEMENTS.has(name)) {
				this.rawTextTag = name;
				this.scriptState = 'data';
			}
		}

		return output;
	}

	private closeElement(name: string, raw: string): string {
		for (let position = this.openElements.length - 1; position >= 0; position--) {
			const element = this.openElements[position];
			if (element.name !== name) continue;
			this.openElements.length = position;
			return `${element.append}${raw}${element.after}`;
		}
		return raw;
	}

	private scanRawText(source: string, index: number, final: boolean): ScanResult {
		if (this.rawTextTag === 'plaintext') return { textEnd: source.length, closed: false };

		const endTag = `</${this.rawTextTag}`;
		for (let lt = source.indexOf('<', index); lt !== -1; lt = source.indexOf('<', lt + 1)) {
			const match = matchTag(source, lt, endTag, final);
			if (match === 'more') return { textEnd: lt, closed: false };
			if (match === 'yes') return { textEnd: lt, closed: true };
		}
		return { textEnd: source.length, closed: false };
	}

	/**
	 * Finds the end of script content, following the HTML script-data escape
	 * states so `</script>` inside `<!-- <script> … -->` does not close it.
	 */
	private scanScript(source: string, index: number, final: boolean): ScanResult {
		for (let position = index; position < source.length; position++) {
			const char = source[position];
			let step: ScriptStep = 0;
			if (char === '-' && this.scriptState !== 'data') step = this.scanEscapeEnd(source, position, final);
			else if (char === '<') step = this.scanScriptMarkup(source, position, final);

			if (step === 'more') return { textEnd: position, closed: false };
			if (step === 'closed') return { textEnd: position, closed: true };
			position += step;
		}
		return { textEnd: source.length, closed: false };
	}

	private scanEscapeEnd(source: string, position: number, final: boolean): ScriptStep {
		const match = matchLiteral(source, position, '-->', final);
		if (match !== 'yes') return match === 'more' ? 'more' : 0;
		this.scriptState = 'data';
		return 2;
	}

	private scanScriptMarkup(source: string, position: number, final: boolean): ScriptStep {
		const endTag = matchTag(source, position, '</script', final);
		if (endTag === 'more') return 'more';
		if (endTag === 'yes') {
			if (this.scriptState !== 'double-escaped') return 'closed';
			this.scriptState = 'escaped';
			return 0;
		}

		if (this.scriptState === 'data') {
			const match = matchLiteral(source, position, '<!--', final);
			if (match !== 'yes') return match === 'more' ? 'more' : 0;
			this.scriptState = 'escaped';
			return 1;
		}

		if (this.scriptState === 'escaped') {
			const match = matchTag(source, position, '<script', final);
			if (match === 'yes') this.scriptState = 'double-escaped';
			return match === 'more' ? 'more' : 0;
		}
		return 0;
	}
}

type ParsedAttribute = {
	name: string;
	value: string;
	/** Original text from the attribute name through its value. */
	source: string;
	rawName: string;
	state: 'original' | 'changed' | 'removed';
};

type ParsedStartTag = { rawName: string; attributes: ParsedAttribute[] };

class RewriterElement implements HtmlRewriterElement {
	private parsed: ParsedStartTag | null = null;
	private readonly beforeParts: string[] = [];
	private readonly prependParts: string[] = [];
	private readonly appendParts: string[] = [];
	private readonly afterParts: string[] = [];
	private readonly raw: string;
	readonly tagName: string;
	readonly selfClosing: boolean;
	readonly canHaveContent: boolean;

	constructor(raw: string, tagName: string, selfClosing: boolean, canHaveContent: boolean) {
		this.raw = raw;
		this.tagName = tagName;
		this.selfClosing = selfClosing;
		this.canHaveContent = canHaveContent;
	}

	get attributes(): IterableIterator<[string, string]> {
		return this.tag()
			.attributes.filter((attribute) => attribute.state !== 'removed')
			.map((attribute): [string, string] => [attribute.name, attribute.value])
			[Symbol.iterator]();
	}

	getAttribute(name: string): string | null {
		return this.findAttribute(name)?.value ?? null;
	}

	hasAttribute(name: string): boolean {
		return this.findAttribute(name) !== undefined;
	}

	setAttribute(name: string, value: string): this {
		const existing = this.findAttribute(name);
		if (existing) {
			existing.value = value;
			existing.state = 'changed';
		} else {
			this.tag().attributes.push({
				name: name.toLowerCase(),
				value,
				source: '',
				rawName: name,
				state: 'changed',
			});
		}
		return this;
	}

	removeAttribute(name: string): this {
		const existing = this.findAttribute(name);
		if (existing) existing.state = 'removed';
		return this;
	}

	before(content: string, options?: HtmlContentOptions): this {
		this.beforeParts.push(toMarkup(content, options));
		return this;
	}

	prepend(content: string, options?: HtmlContentOptions): this {
		this.prependParts.push(toMarkup(content, options));
		return this;
	}

	append(content: string, options?: HtmlContentOptions): this {
		this.appendParts.push(toMarkup(content, options));
		return this;
	}

	after(content: string, options?: HtmlContentOptions): this {
		this.afterParts.push(toMarkup(content, options));
		return this;
	}

	renderStart(): string {
		const prepend = this.canHaveContent ? [...this.prependParts].reverse().join('') : '';
		return `${this.beforeParts.join('')}${this.renderStartTag()}${prepend}`;
	}

	renderAppend(): string {
		return this.canHaveContent ? this.appendParts.join('') : '';
	}

	renderAfter(): string {
		return [...this.afterParts].reverse().join('');
	}

	/**
	 * @remarks
	 * An untouched tag is emitted verbatim. Once an attribute changes, the tag is
	 * re-serialised like lol-html: single spaces between attributes, untouched
	 * attributes as written, and `/>` (spaced after attributes) only for a
	 * self-closing tag that gained no content.
	 */
	private renderStartTag(): string {
		if (!this.parsed || this.parsed.attributes.every((attribute) => attribute.state === 'original')) {
			return this.raw;
		}

		const attributes = this.parsed.attributes
			.filter((attribute) => attribute.state !== 'removed')
			.map((attribute) =>
				attribute.state === 'original'
					? ` ${attribute.source}`
					: ` ${attribute.rawName}="${attribute.value.replaceAll('"', '&quot;')}"`,
			)
			.join('');
		const gainedContent = this.canHaveContent && (this.prependParts.length > 0 || this.appendParts.length > 0);
		const close = this.selfClosing && !gainedContent ? `${attributes ? ' ' : ''}/>` : '>';
		return `<${this.parsed.rawName}${attributes}${close}`;
	}

	private findAttribute(name: string): ParsedAttribute | undefined {
		const normalized = name.toLowerCase();
		return this.tag().attributes.find(
			(attribute) => attribute.state !== 'removed' && attribute.name === normalized,
		);
	}

	private tag(): ParsedStartTag {
		this.parsed ??= parseStartTag(this.raw);
		return this.parsed;
	}
}

function parseStartTag(raw: string): ParsedStartTag {
	const rawName = readTagName(raw, 1);
	const attributes: ParsedAttribute[] = [];
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
			state: 'original',
		});
	}

	return { rawName, attributes };
}

/**
 * Reads an optional `= value` after an attribute name.
 *
 * @remarks `end` stays at `index` when there is no `=`.
 */
function readAttributeValue(raw: string, index: number): { text: string; end: number } {
	let position = skipWhile(raw, index, isWhitespace);
	if (raw[position] !== '=') return { text: '', end: index };

	position = skipWhile(raw, position + 1, isWhitespace);
	const quote = raw[position];
	if (quote === '"' || quote === "'") {
		const close = raw.indexOf(quote, position + 1);
		const valueEnd = close === -1 ? raw.length - 1 : close;
		return { text: raw.slice(position + 1, valueEnd), end: close === -1 ? valueEnd : close + 1 };
	}

	const valueEnd = skipWhile(raw, position, (char) => !isWhitespace(char) && char !== '>');
	return { text: raw.slice(position, valueEnd), end: valueEnd };
}

function skipWhile(raw: string, index: number, predicate: (char: string, at: number) => boolean): number {
	let position = index;
	while (position < raw.length && predicate(raw[position], position)) position++;
	return position;
}

/**
 * Reads a comment, CDATA section (foreign content only), doctype or bogus comment.
 *
 * @remarks Returns `null` to wait for more input while a short prefix could
 * still become `<!--` or `<![CDATA[`.
 */
function readDeclaration(source: string, index: number, final: boolean, foreign: boolean): MarkupToken | null {
	if (source.startsWith('<!--', index)) {
		const end = findCommentEnd(source, index);
		return end === -1 ? null : { output: source.slice(index, end), end };
	}
	if (foreign && source.startsWith('<![CDATA[', index)) {
		const close = source.indexOf(']]>', index + 9);
		return close === -1 ? null : { output: source.slice(index, close + 3), end: close + 3 };
	}

	const rest = source.slice(index);
	const couldGrow = rest.length < 9 && ('<!--'.startsWith(rest) || (foreign && '<![CDATA['.startsWith(rest)));
	if (!final && couldGrow) return null;
	return readUntilTagClose(source, index);
}

/**
 * Finds the end of a comment opened at `index`.
 *
 * @remarks Accepts `-->` and `--!>`, including the abrupt `<!-->` and `<!--->`.
 */
function findCommentEnd(source: string, index: number): number {
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
function scanTag(source: string, index: number): { end: number; selfClosing: boolean } | null {
	let position = index + 1;
	while (position < source.length && !isTagNameEnd(source[position])) position++;

	let quote: string | null = null;
	let afterEquals = false;
	let inUnquotedValue = false;
	for (; position < source.length; position++) {
		const char = source[position];
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === '>') return { end: position, selfClosing: source[position - 1] === '/' && !inUnquotedValue };
		if (isWhitespace(char)) {
			inUnquotedValue = false;
			continue;
		}
		if (afterEquals) {
			afterEquals = false;
			if (char === '"' || char === "'") quote = char;
			else inUnquotedValue = true;
			continue;
		}
		if (char === '=' && !inUnquotedValue) afterEquals = true;
	}
	return null;
}

function isForeignBreakout(name: string, raw: string): boolean {
	if (FOREIGN_BREAKOUT_TAGS.has(name)) return true;
	return (
		name === 'font' &&
		parseStartTag(raw).attributes.some((attribute) => ['color', 'face', 'size'].includes(attribute.name))
	);
}

function readUntilTagClose(source: string, index: number): MarkupToken | null {
	const close = source.indexOf('>', index + 1);
	return close === -1 ? null : { output: source.slice(index, close + 1), end: close + 1 };
}

function readTagName(raw: string, from: number): string {
	let end = from;
	while (end < raw.length && !isTagNameEnd(raw[end])) end++;
	return raw.slice(from, end);
}

/**
 * Matches `prefix` case-insensitively at `index`, followed by a tag-name
 * delimiter. Returns `'more'` when the input ends before the match is decided.
 */
function matchTag(source: string, index: number, prefix: string, final: boolean): Match {
	const available = source.slice(index, index + prefix.length).toLowerCase();
	if (available.length < prefix.length) return !final && prefix.startsWith(available) ? 'more' : 'no';
	if (available !== prefix) return 'no';
	const delimiter = source[index + prefix.length];
	if (delimiter === undefined) return final ? 'no' : 'more';
	return isTagNameEnd(delimiter) ? 'yes' : 'no';
}

function matchLiteral(source: string, index: number, literal: string, final: boolean): Match {
	const available = source.slice(index, index + literal.length);
	if (available.length < literal.length) return !final && literal.startsWith(available) ? 'more' : 'no';
	return available === literal ? 'yes' : 'no';
}

function toMarkup(content: string, options?: HtmlContentOptions): string {
	if (options?.html) return content;
	return content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function isAsciiAlpha(char: string): boolean {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

function isWhitespace(char: string): boolean {
	return char === ' ' || char === '\n' || char === '\t' || char === '\r' || char === '\f';
}

function isTagNameEnd(char: string): boolean {
	return isWhitespace(char) || char === '/' || char === '>';
}
