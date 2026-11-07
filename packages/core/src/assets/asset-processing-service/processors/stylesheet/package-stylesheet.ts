import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { resolvePackageStylesheetPath } from '../../../../plugins/tsconfig-import-resolver.ts';
import { isEmittableReferenceFile } from '../../../../plugins/stylesheet-kinds.ts';
import { appLogger } from '../../../../global/app-logger.ts';
import { warnStylesheetOnce } from './stylesheet-warnings.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { isExternalReference, scanCss, splitReference, wrapInConditions, type CssImport } from './css-scanner.ts';

type StylesheetReferenceContext = {
	/** Where a package stylesheet's files are emitted, for the files its `@import`s inline. */
	output: StylesheetReferenceOutput;
	inlined: Set<string>;
	/** Root-relative, `data:` and remote `@import` statements, hoisted to the top of the output in order. */
	hoisted: string[];
	charset?: string;
};

function realPath(file: string): string {
	return fileSystem.exists(file) ? fileSystem.realpath(file) : file;
}

function realDirectory(file: string): string {
	return realPath(path.dirname(file));
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
 * Uses the core CSS scanner, so strings, comments and escapes are honoured. Both ends are real directories.
 * A target on another Windows drive has no relative form and is written as its
 * absolute path, which {@link emitStylesheetReferences} reads as a file.
 */
export function rebaseStylesheetReferences(css: string, sourceFile: string, entryFile: string): string {
	const entryDir = realDirectory(entryFile);
	const sourceDir = realDirectory(sourceFile);
	return scanCss(css, {
		reference: (reference) => {
			const { filePart, suffix } = splitReference(reference);
			return `${path.relative(entryDir, path.resolve(sourceDir, filePart))}${suffix}`;
		},
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
 * Replaces a package stylesheet's `@import`: a root-relative, `data:` or remote one is hoisted, a relative or package
 * one is inlined once, wrapped in its conditions.
 */
function inlinePackageImport(statement: CssImport, stylesheet: string, context: StylesheetReferenceContext): string {
	if (isExternalReference(statement.specifier)) {
		context.hoisted.push(statement.statement);
		return '';
	}
	const imported = resolveImportedStylesheet(stylesheet, statement.specifier);
	if (context.inlined.has(imported)) return '';
	const inlined = preparePackageStylesheetFile(imported, context, context.output);
	if (!statement.conditions) return inlined;
	const wrapped = wrapInConditions(inlined, statement.conditions);
	if (wrapped === undefined) {
		throw new Error(`[ecopages] ${stylesheet}: cannot read the conditions of ${statement.statement}`);
	}
	return wrapped;
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
	return scanCss(fileSystem.readFileSync(stylesheet), {
		reference: (reference) => emitPackageReference(stylesheet, reference, output),
		import: (statement) => inlinePackageImport(statement, stylesheet, context),
		charset: (statement) => {
			context.charset ??= statement;
			return '';
		},
	});
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
	const context: StylesheetReferenceContext = { output, inlined: new Set(), hoisted: [] };
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
	return scanCss(css, { reference: (reference) => emitAppReference(stylesheet, css, reference, output) });
}
