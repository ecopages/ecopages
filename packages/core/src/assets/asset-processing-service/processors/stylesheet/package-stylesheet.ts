import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { resolvePackageStylesheetPath } from '../../../../plugins/tsconfig-import-resolver.ts';
import { isEmittableReferenceFile } from '../../../../plugins/stylesheet-kinds.ts';
import { appLogger } from '../../../../global/app-logger.ts';
import { warnStylesheetOnce } from './stylesheet-warnings.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';

type StylesheetReferenceContext = {
	/** Where a package stylesheet's files are emitted, for the files its `@import`s inline. */
	output?: StylesheetReferenceOutput;
	/**
	 * Whether this is a package stylesheet: its relative references must stay inside its package, and its `@import`s
	 * and `@charset` are inlined and hoisted. An app stylesheet's at-rules are left as written.
	 */
	fromPackage: boolean;
	inlined: Set<string>;
	/** Root-relative, `data:` and remote `@import` statements, hoisted to the top of the output in order. */
	hoisted: string[];
	charset?: string;
};

type Scanned = { value: string; end: number };

const IDENT_CHAR = /[\w-]/;
const IDENT = /[\w-]+/y;

/** A Windows path with a drive letter, as a rebased reference to a file on another drive is written. */
const DRIVE_PATH = /^[a-z]:[\\/]/i;

/**
 * A reference that does not name a file: a fragment, a root-relative path, or any URL with a scheme (`data:`,
 * `https:`). A Windows drive path names a file.
 */
function isExternalReference(reference: string): boolean {
	return (
		reference === '' ||
		reference.startsWith('#') ||
		reference.startsWith('/') ||
		(/^[a-z][a-z\d+.-]*:/i.test(reference) && !DRIVE_PATH.test(reference))
	);
}

/** Splits a reference into its file part, decoded where it can be, and its `?` or `#` suffix. */
function splitReference(reference: string): { filePart: string; decoded: string; suffix: string } {
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

function realPath(file: string): string {
	return fileSystem.exists(file) ? fileSystem.realpath(file) : file;
}

function realDirectory(file: string): string {
	return realPath(path.dirname(file));
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
 * Emits the file a reference names, or returns `undefined` to leave the reference as written, with a warning, when
 * the file is not a type a stylesheet may copy.
 */
function emitReferencedFile(
	stylesheet: string,
	source: string,
	reference: string,
	file: string,
	suffix: string,
	output: StylesheetReferenceOutput,
): string | undefined {
	if (!isEmittableReferenceFile(file)) {
		warnStylesheetOnce(
			stylesheet,
			source,
			`${stylesheet}: url(${reference}) names ${file}, which is not a font, image or media file, so it is not copied and the reference is left as written.`,
			(message) => appLogger.warn(message),
		);
		return undefined;
	}
	const emitted = writeHashedBrowserAsset({
		bytes: fileSystem.readFileAsBuffer(file),
		directory: output.assetsDir,
		extension: path.extname(file),
	});
	return `${output.toReference(emitted)}${suffix}`;
}

/** Emits the file a package stylesheet's reference names; a missing file fails the build. */
function emitPackageReference(
	stylesheet: string,
	reference: string,
	output: StylesheetReferenceOutput,
): string | undefined {
	const { decoded, suffix } = splitReference(reference);
	const file = path.resolve(path.dirname(stylesheet), decoded);
	if (!fileSystem.exists(file)) {
		throw new Error(`[ecopages] ${stylesheet}: url(${reference}) names ${file}, which does not exist.`);
	}
	return emitReferencedFile(stylesheet, '', reference, fileSystem.realpath(file), suffix, output);
}

/**
 * Emits the file an app stylesheet's reference names, or returns `undefined` to leave the reference as written,
 * with a warning, when the file is missing.
 */
function emitAppReference(
	stylesheet: string,
	source: string,
	reference: string,
	output: StylesheetReferenceOutput,
): string | undefined {
	const { decoded, suffix } = splitReference(reference);
	const file = path.resolve(realDirectory(stylesheet), decoded);
	if (!fileSystem.exists(file)) {
		warnStylesheetOnce(
			stylesheet,
			source,
			`${stylesheet}: url(${reference}) names ${file}, which does not exist, so it is left as written. Reference a file in the public directory with a root-relative URL such as /images/hero.png, and @import a package stylesheet through the @ecopages/postcss-processor presets, which rebase its url() references.`,
			(message) => appLogger.warn(message),
		);
		return undefined;
	}
	return emitReferencedFile(stylesheet, source, reference, fileSystem.realpath(file), suffix, output);
}

/**
 * Rebases the relative `url()` and `image-set()` string references of CSS inlined from `sourceFile` onto
 * `entryFile`, so they name the same files from the importing stylesheet.
 *
 * @remarks
 * Uses the stylesheet tokenizer, so strings, comments and escapes are honoured. Both ends are real directories.
 * A target on another Windows drive has no relative form and is written as its
 * absolute path, which {@link emitStylesheetReferences} reads as a file.
 */
export function rebaseStylesheetReferences(css: string, sourceFile: string, entryFile: string): string {
	const entryDir = realDirectory(entryFile);
	const sourceDir = realDirectory(sourceFile);
	return scanStylesheet(css, sourceFile, appAtRuleContext(), (reference) => {
		const { filePart, suffix } = splitReference(reference);
		return `${path.relative(entryDir, path.resolve(sourceDir, filePart))}${suffix}`;
	});
}

/**
 * @remarks
 * An `@import` specifier is a URL, so `base.css` names a sibling like `./base.css`; a package resolves only when
 * no such file exists. Only a `.css` file is inlined, never a dotfile, so an `@import` cannot publish another file;
 * like a `url()`, it may name a sibling dependency's stylesheet.
 */
function resolveImportedStylesheet(stylesheet: string, specifier: string): string {
	const sibling = path.resolve(path.dirname(stylesheet), specifier);
	const resolved =
		specifier.startsWith('.') || fileSystem.exists(sibling)
			? sibling
			: resolvePackageStylesheetPath(stylesheet, specifier);
	if (!resolved || !fileSystem.exists(resolved)) {
		throw new Error(`[ecopages] ${stylesheet}: cannot resolve @import ${JSON.stringify(specifier)}.`);
	}
	const real = fileSystem.realpath(resolved);
	if (path.extname(real).toLowerCase() !== '.css' || path.basename(real).startsWith('.')) {
		throw new Error(
			`[ecopages] ${stylesheet}: @import ${JSON.stringify(specifier)} names ${real}, which is not a stylesheet.`,
		);
	}
	return real;
}

/**
 * Wraps inlined CSS in the blocks an `@import`'s `layer`, `supports()` and media conditions stand for.
 *
 * @returns The wrapped CSS, or `undefined` when the conditions cannot be read.
 */
function wrapInConditions(css: string, conditions: string): string | undefined {
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

/**
 * Handles the `@import` statement whose `@` is at `start`, returning what replaces it and where scanning resumes.
 */
function handleImport(
	css: string,
	start: number,
	stylesheet: string,
	context: StylesheetReferenceContext,
): { replacement: string; end: number } {
	const statementEnd = findStatementEnd(css, start);
	const end = Math.min(statementEnd + 1, css.length);
	const statement = `${css.slice(start, statementEnd).trim()};`;
	let index = skipSpace(css, start + '@import'.length);
	let target: Scanned | undefined;
	if (css[index] === '"' || css[index] === "'") {
		target = readString(css, index);
	} else if (/^url\(/i.test(css.slice(index, index + 4))) {
		target = readUrl(css, index + 4);
	}
	if (!target) return { replacement: css.slice(start, end), end };
	const conditions = css.slice(target.end, statementEnd).trim();
	if (isExternalReference(target.value)) {
		context.hoisted.push(statement);
		return { replacement: '', end };
	}
	const imported = resolveImportedStylesheet(stylesheet, target.value);
	if (context.inlined.has(imported)) return { replacement: '', end };
	if (!context.output) throw new Error(`[ecopages] ${stylesheet}: only a package stylesheet inlines its @imports.`);
	const inlined = preparePackageStylesheetFile(imported, context, context.output);
	if (!conditions) return { replacement: inlined, end };
	const wrapped = wrapInConditions(inlined, conditions);
	if (wrapped === undefined) {
		throw new Error(`[ecopages] ${stylesheet}: cannot read the conditions of ${statement}`);
	}
	return { replacement: wrapped, end };
}

/** The state of one stylesheet's scan. */
type FileScan = {
	css: string;
	stylesheet: string;
	context: StylesheetReferenceContext;
	/** What a relative reference becomes, or `undefined` to leave it as written. */
	rewrite: (reference: string) => string | undefined;
	/** Names of the functions whose parentheses are open, innermost last; `''` for a plain group. */
	functions: string[];
	braces: number;
};

/** What a token becomes in the output, and where the scan resumes. */
type Token = { text: string; end: number };

function rewriteReference(scan: FileScan, reference: string): string | undefined {
	return isExternalReference(reference) ? undefined : scan.rewrite(reference);
}

/** A string is copied as written, unless it is an `image-set()` reference. */
function scanString(scan: FileScan, index: number): Token {
	const string = readString(scan.css, index);
	const inImageSet = /^(?:-webkit-)?image-set$/i.test(scan.functions[scan.functions.length - 1] ?? '');
	const rewritten = inImageSet ? rewriteReference(scan, string.value) : undefined;
	return {
		text: rewritten === undefined ? scan.css.slice(index, string.end) : JSON.stringify(rewritten),
		end: string.end,
	};
}

/** Handles a top-level `@import` or `@charset`; any other at-rule is left to the scan. */
function scanAtRule(scan: FileScan, index: number): Token | undefined {
	IDENT.lastIndex = index + 1;
	const keyword = IDENT.exec(scan.css)?.[0].toLowerCase();
	if (!scan.context.fromPackage) {
		if (keyword !== 'import') return undefined;
		const end = Math.min(findStatementEnd(scan.css, index) + 1, scan.css.length);
		return { text: scan.css.slice(index, end), end };
	}
	if (keyword === 'import') {
		const handled = handleImport(scan.css, index, scan.stylesheet, scan.context);
		return { text: handled.replacement, end: handled.end };
	}
	if (keyword !== 'charset') return undefined;
	const end = Math.min(findStatementEnd(scan.css, index) + 1, scan.css.length);
	scan.context.charset ??= `${scan.css.slice(index, end).replace(/;?\s*$/, '')};`;
	return { text: '', end };
}

/** Reads an identifier: a `url()` is rewritten, a function name opens a group. */
function scanIdentifier(scan: FileScan, index: number): Token {
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

function scanPunctuation(scan: FileScan, index: number): Token {
	const char = scan.css[index]!;
	if (char === '(') scan.functions.push('');
	if (char === ')') scan.functions.pop();
	if (char === '{') scan.braces += 1;
	if (char === '}') scan.braces = Math.max(0, scan.braces - 1);
	return { text: char, end: index + 1 };
}

function scanToken(scan: FileScan, index: number): Token {
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

function scanStylesheet(
	css: string,
	stylesheet: string,
	context: StylesheetReferenceContext,
	rewrite: (reference: string) => string | undefined,
): string {
	const scan: FileScan = { css, stylesheet, context, rewrite, functions: [], braces: 0 };
	let output = '';
	let index = 0;
	while (index < scan.css.length) {
		const token = scanToken(scan, index);
		output += token.text;
		index = token.end;
	}
	return output;
}

/**
 * Rewrites one package stylesheet: its relative `url()` and `image-set()` string references, its `@import`s and
 * its `@charset`, leaving strings and comments as written.
 */
function preparePackageStylesheetFile(
	stylesheet: string,
	context: StylesheetReferenceContext,
	output: StylesheetReferenceOutput,
): string {
	context.inlined.add(stylesheet);
	return scanStylesheet(fileSystem.readFileSync(stylesheet), stylesheet, context, (reference) =>
		emitPackageReference(stylesheet, reference, output),
	);
}

/** Where emitted files go and how the output stylesheet names them. */
export type StylesheetReferenceOutput = {
	assetsDir: string;
	/** The reference the output stylesheet uses for a file emitted to `assetsDir`. */
	toReference: (emitted: string) => string;
};

/**
 * Returns the browser-ready content of a package stylesheet.
 *
 * @remarks
 * Processors do not transform it: a package ships CSS that is already built, and an app's PostCSS or Tailwind
 * setup is not written for it. A tokenizer that honours strings, comments and escapes finds each relative `url()`
 * and `image-set()` string, emits the file it names to `assetsDir` under a content hash, and rewrites the
 * reference to what `toReference` returns for it. A `?` or `#` suffix is kept; root-relative, `data:` and remote
 * URLs are left as written. An `@import` of a relative or package stylesheet is inlined in its place, its
 * references rewritten from its location, wrapped in `@layer`, `@supports` and `@media` blocks for its conditions,
 * and each file is inlined once. Root-relative, `data:` and remote `@import`s and the first `@charset` are hoisted
 * to the top, where browsers apply them; a hoisted import keeps its own conditions but not those of an `@import`
 * that inlined its file. A reference to a missing file fails the build. Only a font, image or media file is copied;
 * a reference to any other file is left as written with a warning (see {@link isEmittableReferenceFile}).
 */
export function preparePackageStylesheet(stylesheet: string, output: StylesheetReferenceOutput): string {
	const context: StylesheetReferenceContext = { output, fromPackage: true, inlined: new Set(), hoisted: [] };
	const body = preparePackageStylesheetFile(fileSystem.realpath(stylesheet), context, output);
	const head = [...(context.charset ? [context.charset] : []), ...context.hoisted];
	return head.length > 0 ? `${head.join('\n')}\n${body}` : body;
}

/**
 * Emits the files the relative `url()` and `image-set()` references of a processed app stylesheet name, and
 * rewrites each reference to what `toReference` returns for the emitted file.
 *
 * @remarks
 * A reference resolves from the real directory of the source stylesheet, as a Processor leaves it: `postcss-import` in the
 * `@ecopages/postcss-processor` presets rebases the references of the files it inlines onto the importing file.
 * `@import` and `@charset` are left as written. A reference to a missing file is left as written with a warning:
 * Tailwind can generate a `url()` from a class it found in content, and a plain `postcss-import` leaves a package's
 * references as the package wrote them. Only a font, image or media file is copied (see
 * {@link isEmittableReferenceFile}).
 */
export function emitStylesheetReferences(css: string, stylesheet: string, output: StylesheetReferenceOutput): string {
	return scanStylesheet(css, stylesheet, appAtRuleContext(), (reference) =>
		emitAppReference(stylesheet, css, reference, output),
	);
}

/** The scan state of a stylesheet whose `@import`s and `@charset` are left as written. */
function appAtRuleContext(): StylesheetReferenceContext {
	return { fromPackage: false, inlined: new Set(), hoisted: [] };
}
