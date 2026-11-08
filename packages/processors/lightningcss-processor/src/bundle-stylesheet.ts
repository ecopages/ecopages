import {
	isExternalReference,
	rebaseStylesheetReferences,
	resolvePackageStylesheetPath,
	resolveProjectImportPath,
	scanCss,
	splitReference,
	toPackageScopeFile,
	warnStylesheetOnce,
} from '@ecopages/core/processor';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Logger } from '@ecopages/logger';
import type { CSSModuleExports, Warning } from 'lightningcss';
import { loadLightningCss, type ResolvedLightningCssOptions } from './lightningcss-engine.ts';

const logger = new Logger('[@ecopages/lightningcss-processor]');

/** A stylesheet with its `@import`s inlined, and the files that took part. */
export type BundledStylesheet = {
	/** The bundled CSS, as Lightning CSS wrote it; the hoisted `@import`s are not yet in it. */
	code: Uint8Array;
	/** The `@import` statements that stay external, in order, to put at the top of the output. */
	hoisted: string[];
	/** The warnings Lightning CSS raised. */
	warnings: Warning[];
	/** The partials read, and the `.css` files an `@import` named that do not exist yet. */
	dependencies: string[];
	/** The scoped class names of a CSS Module, by local name; absent for any other stylesheet. */
	exports?: CSSModuleExports;
};

/** A stylesheet an `@import` names: the path as core reads it, and its real path, which identifies it. */
type ImportedStylesheet = { located: string; real: string };

/** A stylesheet Lightning CSS scopes as a CSS Module. */
const CSS_MODULE_FILE = /\.module\.css$/iu;

const COMPOSES_FROM = /\bcomposes\s*:[^;{}]*?\bfrom\s+(?:'([^']+)'|"([^"]+)")/giu;

/** The specifiers of the stylesheets `css` composes classes from, other than `global`, in order and once each. */
function composedStylesheets(css: string): string[] {
	const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
	const specifiers = [...withoutComments.matchAll(COMPOSES_FROM)].map((match) => match[1] ?? match[2]!);
	return [...new Set(specifiers)];
}

/**
 * The file a stylesheet is scoped as, or `undefined` for a file of the app.
 *
 * @remarks
 * A file of an installed package is scoped by its package name and the path inside the package (see
 * `toPackageScopeFile`), whichever folder or package-manager layout it is installed in. The stylesheet itself is
 * always read from its real path.
 */
export function packageScopeFile(file: string, rootDir: string): string | undefined {
	return toPackageScopeFile(fileSystem.exists(file) ? fileSystem.realpath(file) : file, rootDir);
}

const resolutionKey = (importer: string, specifier: string): string => `${importer}\0${specifier}`;

/**
 * The state of bundling one stylesheet.
 *
 * @remarks
 * `prepare` walks the imports depth first, in the order written, before Lightning CSS runs, so what is hoisted and
 * which import closes a cycle do not depend on the order Lightning CSS reads files in. A relative `@import` resolves
 * from the path as written, symlinks included, and a `url()` from the real directory, as core's scanner does for the
 * same file. Lightning CSS only ever sees real paths.
 */
class StylesheetBundle {
	readonly dependencies = new Set<string>();
	/** The `@import` statements that stay external, in the order core hoists them. */
	readonly hoisted: string[] = [];
	/** The prepared CSS of each file, by real path. */
	private readonly scanned = new Map<string, string>();
	private readonly resolutions = new Map<string, string>();
	/** The real path of each file Lightning CSS was given a package scope file for. */
	private readonly realByScope = new Map<string, string>();
	/** The real paths of the files being walked, innermost last. */
	private readonly stack: string[] = [];

	constructor(
		private readonly entry: string,
		private readonly source: string,
		private readonly rootDir: string,
		private readonly cssModules: boolean,
	) {}

	private warn(message: string): void {
		warnStylesheetOnce(this.entry, this.source, `${this.entry}: ${message}`, (text) => logger.warn(text));
	}

	/** The file an `@import` of `importer` names, before any check of what it is. */
	private locate(specifier: string, importer: string): string | undefined {
		const { decoded } = splitReference(specifier);
		const sibling = path.resolve(path.dirname(importer), decoded);
		if (decoded.startsWith('.') || fileSystem.exists(sibling)) return sibling;
		try {
			return (
				resolveProjectImportPath(this.rootDir, importer, decoded) ??
				resolvePackageStylesheetPath(importer, specifier)
			);
		} catch {
			return undefined;
		}
	}

	/**
	 * Resolves an `@import` the way core does: relative to the importer, then a tsconfig alias, then a package.
	 *
	 * @remarks
	 * Only a `.css` file is inlined, never a dotfile, so an `@import` cannot publish another file. An `@import` that
	 * names nothing usable is left as written with a warning that names the importer, and a missing `.css` file is
	 * a dependency, so creating it rebuilds the stylesheet.
	 */
	private resolveImport(specifier: string, importer: string): ImportedStylesheet | undefined {
		if (isExternalReference(specifier)) return undefined;
		const located = this.locate(specifier, importer);
		if (!located || !fileSystem.exists(located)) {
			if (located && path.extname(located).toLowerCase() === '.css') this.dependencies.add(path.resolve(located));
			this.warn(
				`@import ${JSON.stringify(specifier)} in ${importer} names ${located ?? 'nothing that resolves'}, which does not exist, so it is left as written.`,
			);
			return undefined;
		}
		const real = fileSystem.realpath(located);
		if (path.extname(real).toLowerCase() !== '.css' || path.basename(real).startsWith('.')) {
			this.warn(
				`@import ${JSON.stringify(specifier)} in ${importer} names ${real}, which is not a stylesheet, so it is left as written.`,
			);
			return undefined;
		}
		return { located, real };
	}

	/**
	 * Prepares `file` for Lightning CSS: its `url()` references rebased onto the entry, and its `@import`s resolved, with
	 * each partial prepared where it is imported.
	 *
	 * @remarks
	 * An external `@import` is taken out to be hoisted, since Lightning CSS fails on one that follows a bundled
	 * `@import`, where core hoists them all to the top of the output. An `@import` that closes a cycle is taken out
	 * with a warning, since Lightning CSS drops the CSS of every stylesheet in a cycle, where core inlines each once.
	 */
	prepare(file = this.entry): void {
		const real = fileSystem.exists(file) ? fileSystem.realpath(file) : file;
		if (this.scanned.has(real)) return;
		this.scanned.set(real, '');
		this.stack.push(real);
		const isEntry = file === this.entry;
		let css = isEntry ? this.source : fileSystem.readFileSync(file);
		if (!isEntry) {
			this.dependencies.add(file);
			css = rebaseStylesheetReferences(css, file, this.entry);
		}
		const composed = this.cssModules ? composedStylesheets(css) : [];
		this.scanned.set(
			real,
			scanCss(css, {
				import: (statement) => {
					const imported = this.resolveImport(statement.specifier, file);
					if (!imported) {
						this.hoisted.push(statement.statement);
						return '';
					}
					if (this.stack.includes(imported.real)) {
						this.warn(
							`@import ${JSON.stringify(statement.specifier)} in ${file} names ${imported.real}, which imports ${file}, so it is skipped.`,
						);
						return '';
					}
					this.resolutions.set(resolutionKey(real, statement.specifier), imported.real);
					this.prepare(imported.located);
					return undefined;
				},
			}),
		);
		for (const specifier of composed) this.prepareComposed(specifier, file, real);
		this.stack.pop();
	}

	/**
	 * Prepares the stylesheet a `composes: name from 'specifier'` declaration of `file` names, which Lightning CSS reads
	 * and scopes with the rest of the bundle.
	 *
	 * @remarks
	 * It resolves as an `@import` does. A stylesheet that cannot be found fails the bundle, since leaving the
	 * declaration as written would export a class name that is not defined. One that closes a cycle is skipped, since
	 * the stylesheet being walked already defines its classes.
	 */
	private prepareComposed(specifier: string, file: string, real: string): void {
		const imported = this.resolveImport(specifier, file);
		if (!imported) throw new Error(`${file}: composes from ${JSON.stringify(specifier)} names no stylesheet.`);
		this.resolutions.set(resolutionKey(real, specifier), imported.real);
		if (!this.stack.includes(imported.real)) this.prepare(imported.located);
	}

	/** The name Lightning CSS knows `real` by: its scope file for a file of a package, `real` itself otherwise. */
	scopeOf(real: string): string {
		const scope = this.cssModules ? packageScopeFile(real, this.rootDir) : undefined;
		if (!scope) return real;
		this.realByScope.set(scope, real);
		return scope;
	}

	/** The real path of a file Lightning CSS names by {@link scopeOf}. */
	realOf(file: string): string {
		const resolved = path.resolve(file);
		return this.realByScope.get(resolved) ?? resolved;
	}

	read(file: string): string {
		const css = this.scanned.get(this.realOf(file));
		if (css === undefined) throw new Error(`${file} was not prepared before bundling.`);
		return css;
	}

	resolve(specifier: string, originatingFile: string): string {
		const resolved = this.resolutions.get(resolutionKey(this.realOf(originatingFile), specifier));
		if (!resolved) {
			throw new Error(
				`${originatingFile}: @import ${JSON.stringify(specifier)} was not resolved before bundling.`,
			);
		}
		return this.scopeOf(resolved);
	}
}

/**
 * Bundles the `@import`s of an app stylesheet with Lightning CSS.
 *
 * @remarks
 * `css` is the in-memory source of `file`, which may differ from the file on disk. A cycle of `@import`s and a
 * stylesheet imported twice are handled by Lightning CSS: the last import of a stylesheet wins, as the specification says.
 * Lightning CSS names the files of a package CSS Module by their scope file (see {@link packageScopeFile}), which
 * is what its class names hash.
 */
export async function bundleStylesheet(
	css: string,
	file: string,
	rootDir: string,
	options: ResolvedLightningCssOptions,
): Promise<BundledStylesheet> {
	const { bundleAsync } = await loadLightningCss();
	const entry = path.resolve(file);
	const isCssModule = CSS_MODULE_FILE.test(entry);
	const bundle = new StylesheetBundle(entry, css, rootDir, isCssModule);
	bundle.prepare();
	const { cssModulesPattern, ...lightningOptions } = options;
	const result = await bundleAsync({
		...lightningOptions,
		...(isCssModule ? { cssModules: { pattern: cssModulesPattern } } : {}),
		filename: bundle.scopeOf(fileSystem.exists(entry) ? fileSystem.realpath(entry) : entry),
		resolver: {
			read: (source) => bundle.read(source),
			resolve: (specifier, originatingFile) => bundle.resolve(specifier, originatingFile),
		},
	});
	return {
		code: result.code,
		hoisted: bundle.hoisted,
		warnings: result.warnings.map((warning) => ({
			...warning,
			loc: { ...warning.loc, filename: bundle.realOf(warning.loc.filename) },
		})),
		dependencies: [...bundle.dependencies].filter((dependency) => dependency !== entry),
		...(result.exports ? { exports: result.exports } : {}),
	};
}
