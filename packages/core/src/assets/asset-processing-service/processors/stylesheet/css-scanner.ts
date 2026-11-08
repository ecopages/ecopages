/**
 * The core CSS scanner: finds and rewrites the references in a stylesheet.
 *
 * @remarks
 * Engine-free and pure: it reads no file and knows no Processor. It honours strings, comments and escapes, so
 * `content: "url(x)"` and a commented-out `@import` are left alone. A caller decides what a reference becomes: a
 * package stylesheet fails on a missing file, an app stylesheet warns, and the Processors' output is scanned the same way.
 */

type Scanned = { value: string; end: number };

const IDENT_CHAR = /[\w-]/;
const IDENT = /[\w-]+/y;

/** A Windows path with a drive letter, as a rebased reference to a file on another drive is written. */
const DRIVE_PATH = /^[a-z]:[\\/]/i;

/**
 * A reference that does not name a file: a fragment, a root-relative path, or any URL with a scheme (`data:`,
 * `https:`). A Windows drive path names a file.
 */
export function isExternalReference(reference: string): boolean {
	return (
		reference === '' ||
		reference.startsWith('#') ||
		reference.startsWith('/') ||
		(/^[a-z][a-z\d+.-]*:/i.test(reference) && !DRIVE_PATH.test(reference))
	);
}

/** Splits a reference into its file part, decoded where it can be, and its `?` or `#` suffix. */
export function splitReference(reference: string): { filePart: string; decoded: string; suffix: string } {
	const suffixStart = reference.search(/[?#]/);
	const filePart = suffixStart === -1 ? reference : reference.slice(0, suffixStart);
	const suffix = suffixStart === -1 ? '' : reference.slice(suffixStart);
	let decoded = filePart;
	try {
		decoded = decodeURI(filePart);
	} catch {
		decoded = filePart;
	}
	return { filePart, decoded, suffix };
}

/**
 * Reads a CSS escape starting at the backslash at `start`.
 *
 * @remarks
 * Follows CSS Syntax: up to six hex digits and one optional whitespace, an escaped newline that continues a
 * string, or any other character taken literally.
 */
function readEscape(css: string, start: number): Scanned {
	const hex = /^[\da-f]{1,6}/i.exec(css.slice(start + 1, start + 7))?.[0];
	if (hex) {
		let end = start + 1 + hex.length;
		if (/\s/.test(css[end] ?? '')) end += css[end] === '\r' && css[end + 1] === '\n' ? 2 : 1;
		const codePoint = Number.parseInt(hex, 16);
		return { value: codePoint === 0 || codePoint > 0x10ffff ? '�' : String.fromCodePoint(codePoint), end };
	}
	if (css[start + 1] === '\n') return { value: '', end: start + 2 };
	return { value: css[start + 1] ?? '', end: Math.min(start + 2, css.length) };
}

/** Reads the quoted string starting at `start`, ending after its closing quote, at a newline, or at the end. */
function readString(css: string, start: number): Scanned {
	const quote = css[start];
	let value = '';
	let index = start + 1;
	while (index < css.length && css[index] !== quote && css[index] !== '\n') {
		if (css[index] === '\\') {
			const escape = readEscape(css, index);
			value += escape.value;
			index = escape.end;
			continue;
		}
		value += css[index];
		index += 1;
	}
	return { value, end: css[index] === quote ? index + 1 : index };
}

function readComment(css: string, start: number): number {
	const end = css.indexOf('*/', start + 2);
	return end === -1 ? css.length : end + 2;
}

function skipSpace(css: string, start: number): number {
	let index = start;
	while (index < css.length) {
		if (/\s/.test(css[index]!)) index += 1;
		else if (css.startsWith('/*', index)) index = readComment(css, index);
		else break;
	}
	return index;
}

/**
 * Reads the argument of a `url(` whose opening parenthesis ends just before `start`, quoted or not.
 *
 * @returns The decoded reference and the index after the closing parenthesis, or `undefined` when it is malformed
 * or is not a literal reference, such as `url(var(--x))`, which the scan then reads as nested functions.
 */
function readUrl(css: string, start: number): Scanned | undefined {
	let index = skipSpace(css, start);
	if (css[index] === '"' || css[index] === "'") {
		const string = readString(css, index);
		index = skipSpace(css, string.end);
		return css[index] === ')' ? { value: string.value, end: index + 1 } : undefined;
	}
	let value = '';
	while (index < css.length && css[index] !== ')') {
		if (css[index] === '\\') {
			const escape = readEscape(css, index);
			value += escape.value;
			index = escape.end;
			continue;
		}
		if (css[index] === '(') return undefined;
		value += css[index];
		index += 1;
	}
	return css[index] === ')' ? { value: value.trim(), end: index + 1 } : undefined;
}

/**
 * Walks `css` from `start`, skipping strings, comments and escapes, and stops where `stop` returns true for a
 * character at parenthesis depth `depth`.
 */
function scanUntil(css: string, start: number, stop: (char: string, depth: number) => boolean): number {
	let depth = 0;
	let index = start;
	while (index < css.length) {
		const char = css[index]!;
		if (char === '"' || char === "'") {
			index = readString(css, index).end;
			continue;
		}
		if (css.startsWith('/*', index)) {
			index = readComment(css, index);
			continue;
		}
		if (char === '\\') {
			index = readEscape(css, index).end;
			continue;
		}
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (stop(char, depth)) return index;
		index += 1;
	}
	return css.length;
}

/** Reads the contents of the parenthesized group whose opening parenthesis is at `start`. */
function readParenthesized(css: string, start: number): Scanned {
	const close = scanUntil(css, start, (char, depth) => char === ')' && depth === 0);
	return { value: css.slice(start + 1, close), end: Math.min(close + 1, css.length) };
}

/** The end of the at-rule prelude starting at `start`: its `;` outside parentheses, or the end of the file. */
function findStatementEnd(css: string, start: number): number {
	return scanUntil(css, start, (char, depth) => char === ';' && depth <= 0);
}

/**
 * Wraps inlined CSS in the blocks an `@import`'s `layer`, `supports()` and media conditions stand for.
 *
 * @returns The wrapped CSS, or `undefined` when the conditions cannot be read.
 */
export function wrapInConditions(css: string, conditions: string): string | undefined {
	let rest = conditions.trim();
	let layer: string | undefined;
	let supports: string | undefined;
	const layerMatch = /^layer\b/i.exec(rest);
	if (layerMatch) {
		rest = rest.slice(layerMatch[0].length);
		if (rest.startsWith('(')) {
			const group = readParenthesized(rest, 0);
			layer = group.value.trim();
			rest = rest.slice(group.end);
		} else {
			layer = '';
		}
		rest = rest.trim();
	}
	const supportsMatch = /^supports\(/i.exec(rest);
	if (supportsMatch) {
		const group = readParenthesized(rest, supportsMatch[0].length - 1);
		supports = group.value.trim();
		rest = rest.slice(group.end).trim();
	}
	if (rest.includes('{') || rest.includes('}')) return undefined;
	let wrapped = css;
	if (rest) wrapped = `@media ${rest} {\n${wrapped}\n}`;
	if (supports !== undefined) wrapped = `@supports (${supports}) {\n${wrapped}\n}`;
	if (layer !== undefined) wrapped = `@layer${layer ? ` ${layer}` : ''} {\n${wrapped}\n}`;
	return wrapped;
}

/** An `@import` statement the scan found at the top level. */
export type CssImport = {
	/** The statement as written, trimmed and ending in `;`, for a caller that hoists it. */
	statement: string;
	/** The imported URL, decoded. */
	specifier: string;
	/** What follows the URL: the `layer`, `supports()` and media conditions, trimmed. */
	conditions: string;
};

/** What a scan asks of its caller; a missing handler leaves what it handles as written. */
export type CssScanHandlers = {
	/**
	 * What a relative `url()` or `image-set()` string reference becomes, or `undefined` to leave it as written.
	 *
	 * @remarks
	 * Fragments, root-relative paths and URLs with a scheme never reach it, since they name no file.
	 */
	reference?: (reference: string) => string | undefined;
	/** What replaces a top-level `@import` the scan could read, or `undefined` to leave the statement as written. */
	import?: (statement: CssImport) => string | undefined;
	/** What replaces the top-level `@charset`; the statement is passed trimmed and ending in `;`. */
	charset?: (statement: string) => string;
};

/** The state of one scan. */
type CssScan = {
	css: string;
	handlers: CssScanHandlers;
	/** Names of the functions whose parentheses are open, innermost last; `''` for a plain group. */
	functions: string[];
	braces: number;
};

/** What a token becomes in the output, and where the scan resumes. */
type Token = { text: string; end: number };

function rewriteReference(scan: CssScan, reference: string): string | undefined {
	return isExternalReference(reference) ? undefined : scan.handlers.reference?.(reference);
}

/** A string is copied as written, unless it is an `image-set()` reference. */
function scanString(scan: CssScan, index: number): Token {
	const string = readString(scan.css, index);
	const inImageSet = /^(?:-webkit-)?image-set$/i.test(scan.functions[scan.functions.length - 1] ?? '');
	const rewritten = inImageSet ? rewriteReference(scan, string.value) : undefined;
	return {
		text: rewritten === undefined ? scan.css.slice(index, string.end) : JSON.stringify(rewritten),
		end: string.end,
	};
}

/** The `@import` whose `@` is at `start`, or `undefined` when its URL cannot be read; the scan then leaves it. */
function readImport(css: string, start: number, statementEnd: number): CssImport | undefined {
	let index = skipSpace(css, start + '@import'.length);
	let target: Scanned | undefined;
	if (css[index] === '"' || css[index] === "'") {
		target = readString(css, index);
	} else if (/^url\(/i.test(css.slice(index, index + 4))) {
		target = readUrl(css, index + 4);
	}
	if (!target) return undefined;
	return {
		statement: `${css.slice(start, statementEnd).trim()};`,
		specifier: target.value,
		conditions: css.slice(target.end, statementEnd).trim(),
	};
}

/** Handles a top-level `@import` or `@charset`; any other at-rule is left to the scan. */
function scanAtRule(scan: CssScan, index: number): Token | undefined {
	IDENT.lastIndex = index + 1;
	const keyword = IDENT.exec(scan.css)?.[0].toLowerCase();
	if (keyword !== 'import' && keyword !== 'charset') return undefined;
	const statementEnd = findStatementEnd(scan.css, index);
	const end = Math.min(statementEnd + 1, scan.css.length);
	const written = { text: scan.css.slice(index, end), end };
	if (keyword === 'charset') {
		const statement = `${scan.css.slice(index, end).replace(/;?\s*$/, '')};`;
		return scan.handlers.charset ? { text: scan.handlers.charset(statement), end } : written;
	}
	const statement = readImport(scan.css, index, statementEnd);
	const replacement = statement && scan.handlers.import?.(statement);
	return replacement === undefined ? written : { text: replacement, end };
}

/** Reads an identifier: a `url()` is rewritten, a function name opens a group. */
function scanIdentifier(scan: CssScan, index: number): Token {
	IDENT.lastIndex = index;
	const name = IDENT.exec(scan.css)![0];
	const open = index + name.length;
	if (scan.css[open] !== '(') return { text: name, end: open };
	if (name.toLowerCase() === 'url') {
		const url = readUrl(scan.css, open + 1);
		if (url) {
			const rewritten = rewriteReference(scan, url.value);
			return {
				text: rewritten === undefined ? scan.css.slice(index, url.end) : `url(${JSON.stringify(rewritten)})`,
				end: url.end,
			};
		}
	}
	scan.functions.push(name);
	return { text: scan.css.slice(index, open + 1), end: open + 1 };
}

function scanPunctuation(scan: CssScan, index: number): Token {
	const char = scan.css[index]!;
	if (char === '(') scan.functions.push('');
	if (char === ')') scan.functions.pop();
	if (char === '{') scan.braces += 1;
	if (char === '}') scan.braces = Math.max(0, scan.braces - 1);
	return { text: char, end: index + 1 };
}

function scanToken(scan: CssScan, index: number): Token {
	const { css } = scan;
	const char = css[index]!;
	if (css.startsWith('/*', index)) {
		const end = readComment(css, index);
		return { text: css.slice(index, end), end };
	}
	if (char === '"' || char === "'") return scanString(scan, index);
	if (char === '\\') {
		const end = readEscape(css, index).end;
		return { text: css.slice(index, end), end };
	}
	if (char === '@' && scan.braces === 0) {
		const atRule = scanAtRule(scan, index);
		if (atRule) return atRule;
	}
	if (IDENT_CHAR.test(char) && !IDENT_CHAR.test(css[index - 1] ?? '')) return scanIdentifier(scan, index);
	return scanPunctuation(scan, index);
}

/**
 * Walks `css` once and returns it with each reference the handlers rewrite replaced.
 *
 * @remarks
 * Sees the `url()` and `image-set()` string references anywhere, and the `@import` and `@charset` rules outside any
 * block. Everything else, including strings, comments and escapes, is copied as written.
 */
export function scanCss(css: string, handlers: CssScanHandlers): string {
	const scan: CssScan = { css, handlers, functions: [], braces: 0 };
	let output = '';
	let index = 0;
	while (index < scan.css.length) {
		const token = scanToken(scan, index);
		output += token.text;
		index = token.end;
	}
	return output;
}

/** The references of a stylesheet, as {@link listCssReferences} finds them. */
export type CssReferences = {
	/** The relative `url()` and `image-set()` string references, without duplicates. */
	references: string[];
	/** Every top-level `@import`, relative or not. */
	imports: CssImport[];
};

/** Lists the references of `css` without rewriting any. */
export function listCssReferences(css: string): CssReferences {
	const references = new Set<string>();
	const imports: CssImport[] = [];
	scanCss(css, {
		reference: (reference) => {
			references.add(reference);
			return undefined;
		},
		import: (statement) => {
			imports.push(statement);
			return undefined;
		},
	});
	return { references: [...references], imports };
}

/** What a {@link CssToken} is. */
export type CssTokenType =
	| 'comment'
	| 'string'
	| 'escape'
	| 'url'
	| 'word'
	| 'space'
	/** Any other single character, such as `{`, `;`, `(` or `.`. */
	| 'punct';

/** A token of a stylesheet: its type and the half-open range `[start, end)` it covers. */
export type CssToken = { type: CssTokenType; start: number; end: number };

/**
 * Splits `css` into tokens that cover it without gaps, so a caller finds the structure of a stylesheet without
 * reading a `{` or a `;` inside a string, a comment, an escape or a `url()`.
 *
 * @remarks
 * A `word` is a run of letters, digits, `_` and `-`; a `url()` with a literal argument is one `url` token. It is a
 * lexer, not a parser: it keeps no brace or parenthesis depth, which is the caller's to track.
 */
export function tokenizeCss(css: string): CssToken[] {
	const tokens: CssToken[] = [];
	let index = 0;
	while (index < css.length) {
		const char = css[index]!;
		let type: CssTokenType = 'punct';
		let end = index + 1;
		if (css.startsWith('/*', index)) {
			type = 'comment';
			end = readComment(css, index);
		} else if (char === '"' || char === "'") {
			type = 'string';
			end = readString(css, index).end;
		} else if (char === '\\') {
			type = 'escape';
			end = readEscape(css, index).end;
		} else if (/\s/.test(char)) {
			type = 'space';
			while (end < css.length && /\s/.test(css[end]!)) end += 1;
		} else if (IDENT_CHAR.test(char)) {
			type = 'word';
			IDENT.lastIndex = index;
			end = index + IDENT.exec(css)![0].length;
			const url =
				css[end] === '(' && css.slice(index, end).toLowerCase() === 'url' ? readUrl(css, end + 1) : undefined;
			if (url) {
				type = 'url';
				end = url.end;
			}
		}
		tokens.push({ type, start: index, end });
		index = end;
	}
	return tokens;
}
