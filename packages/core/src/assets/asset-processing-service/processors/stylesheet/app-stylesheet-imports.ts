import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../../../global/app-logger.ts';
import { isExternalReference, scanCss, splitReference, wrapInConditions, type CssImport } from './css-scanner.ts';
import { warnStylesheetOnce } from './stylesheet-warnings.ts';

/** The real path of `file`, or `file` itself when it does not exist (yet). */
export function realPath(file: string): string {
	return fileSystem.exists(file) ? fileSystem.realpath(file) : file;
}

/** The real directory of `file`. */
export function realDirectory(file: string): string {
	return realPath(path.dirname(file));
}

/** Rewrites a relative reference written in a file of `sourceDir` to name the same file from `entryDir`. */
function rebaseReference(reference: string, sourceDir: string, entryDir: string): string {
	const { filePart, suffix } = splitReference(reference);
	return `${path.relative(entryDir, path.resolve(sourceDir, filePart))}${suffix}`;
}

/**
 * Rebases the relative `url()` and `image-set()` string references of CSS inlined from `sourceFile` onto
 * `entryFile`, so they name the same files from the importing stylesheet.
 *
 * @remarks
 * Uses the core CSS scanner, so strings, comments and escapes are honoured. Both ends are real directories.
 * A target on another Windows drive has no relative form and is written as its absolute path, which
 * `emitStylesheetReferences` reads as a file.
 */
export function rebaseStylesheetReferences(css: string, sourceFile: string, entryFile: string): string {
	const entryDir = realDirectory(entryFile);
	const sourceDir = realDirectory(sourceFile);
	return scanCss(css, { reference: (reference) => rebaseReference(reference, sourceDir, entryDir) });
}

/** The state of inlining the `@import`s of one app stylesheet. */
type InlineContext = {
	stylesheet: string;
	/** The stylesheet's CSS before inlining, which a warning is shown once for. */
	source: string;
	entryDir: string;
	/** The real paths of the stylesheet and of every partial inlined so far, so a partial is inlined once. */
	inlined: Set<string>;
	/** Root-relative, `data:` and remote `@import` statements, hoisted to the top of the output in order. */
	hoisted: string[];
	charset?: string;
	/** The partials inlined, and the `.css` files an `@import` named that do not exist yet. */
	dependencies: Set<string>;
};

function warn(context: InlineContext, message: string): void {
	warnStylesheetOnce(context.stylesheet, context.source, `${context.stylesheet}: ${message}`, (text) =>
		appLogger.warn(text),
	);
}

/** Inlines the partial an `@import` of `importer` names. Returns `undefined` to leave the `@import` as written. */
function inlineImport(statement: CssImport, importer: string, context: InlineContext): string | undefined {
	if (isExternalReference(statement.specifier)) {
		context.hoisted.push(statement.statement);
		return '';
	}
	const { decoded } = splitReference(statement.specifier);
	const partial = path.resolve(path.dirname(importer), decoded);
	if (!fileSystem.exists(partial)) {
		if (!decoded.startsWith('.')) return undefined;
		if (path.extname(partial).toLowerCase() === '.css') context.dependencies.add(partial);
		warn(
			context,
			`@import ${JSON.stringify(statement.specifier)} in ${importer} names ${partial}, which does not exist, so it is left as written.`,
		);
		return undefined;
	}
	const real = fileSystem.realpath(partial);
	if (path.extname(real).toLowerCase() !== '.css' || path.basename(real).startsWith('.')) {
		warn(
			context,
			`@import ${JSON.stringify(statement.specifier)} in ${importer} names ${real}, which is not a stylesheet, so it is left as written.`,
		);
		return undefined;
	}
	if (context.inlined.has(real)) return '';
	if (statement.conditions && wrapInConditions('', statement.conditions) === undefined) {
		warn(context, `cannot read the conditions of ${statement.statement} in ${importer}, so it is left as written.`);
		return undefined;
	}
	context.inlined.add(real);
	context.dependencies.add(partial);
	const inlined = inlineFile(fileSystem.readFileSync(real), partial, context, false);
	return statement.conditions ? wrapInConditions(inlined, statement.conditions) : inlined;
}

/** Scans one file: inlines its `@import`s, hoists its `@charset`, and rebases a partial's references onto the entry. */
function inlineFile(css: string, file: string, context: InlineContext, isEntry: boolean): string {
	const dir = realDirectory(file);
	return scanCss(css, {
		reference: isEntry ? undefined : (reference) => rebaseReference(reference, dir, context.entryDir),
		import: (statement) => inlineImport(statement, file, context),
		charset: (statement) => {
			context.charset ??= statement;
			return '';
		},
	});
}

/** An app stylesheet after its relative `@import`s are inlined, and the partials that took part. */
export type InlinedStylesheet = {
	css: string;
	/** Absolute paths, without duplicates or the stylesheet itself. */
	dependencies: string[];
};

/**
 * Inlines the relative `@import`s of an app stylesheet, as a package stylesheet's are, so plain CSS with no Processor
 * works once it is written to another folder.
 *
 * @remarks
 * Runs on the output of the Processor, which has usually inlined them already (`postcss-import`, Lightning CSS), and
 * then finds nothing to do. A partial's references are rebased onto the stylesheet, so
 * `emitStylesheetReferences` finds the files they name. Its `layer`, `supports()` and media conditions wrap its
 * CSS, and remote and root-relative `@import`s and the first `@charset` move to the top. Only a `.css` file is
 * inlined, never a dotfile. An `@import` that names no file is left as written with a warning; a bare specifier that
 * names no sibling, such as a package, is left for the Processor. The returned dependencies include a missing `.css`
 * partial, so creating it rebuilds the stylesheet.
 */
export function inlineStylesheetImports(css: string, stylesheet: string): InlinedStylesheet {
	if (!/@import/i.test(css)) return { css, dependencies: [] };
	const entry = path.resolve(stylesheet);
	const context: InlineContext = {
		stylesheet: entry,
		source: css,
		entryDir: realDirectory(entry),
		inlined: new Set([realPath(entry)]),
		hoisted: [],
		dependencies: new Set(),
	};
	const body = inlineFile(css, entry, context, true);
	if (context.inlined.size === 1) return { css, dependencies: [...context.dependencies] };
	const head = [...(context.charset ? [context.charset] : []), ...context.hoisted];
	return {
		css: head.length > 0 ? `${head.join('\n')}\n${body}` : body,
		dependencies: [...context.dependencies].filter((dependency) => dependency !== entry),
	};
}
