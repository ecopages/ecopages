import {
	isExternalReference,
	rebaseStylesheetReferences,
	resolvePackageStylesheetPath,
	resolveProjectImportPath,
	scanCss,
	splitReference,
	warnStylesheetOnce,
} from '@ecopages/core/processor';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Logger } from '@ecopages/logger';
import type { Warning } from 'lightningcss';
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
};

/** How an `@import` specifier resolves: to the real path of a stylesheet, or to nothing, so the statement stays as written. */
type Resolution = { file: string } | { file?: undefined };

const resolutionKey = (importer: string, specifier: string): string => `${importer}\0${specifier}`;

/** The state of bundling one stylesheet. */
class StylesheetBundle {
	readonly dependencies = new Set<string>();
	readonly hoisted: string[] = [];
	private readonly resolutions = new Map<string, string>();
	/** The partials each file has imported so far, to find an `@import` that closes a cycle. */
	private readonly imports = new Map<string, Set<string>>();

	constructor(
		private readonly entry: string,
		private readonly source: string,
		private readonly rootDir: string,
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
	private resolveImport(specifier: string, importer: string): Resolution {
		if (isExternalReference(specifier)) return {};
		const located = this.locate(specifier, importer);
		if (!located || !fileSystem.exists(located)) {
			if (located && path.extname(located).toLowerCase() === '.css') this.dependencies.add(path.resolve(located));
			this.warn(
				`@import ${JSON.stringify(specifier)} in ${importer} names ${located ?? 'nothing that resolves'}, which does not exist, so it is left as written.`,
			);
			return {};
		}
		const real = fileSystem.realpath(located);
		if (path.extname(real).toLowerCase() !== '.css' || path.basename(real).startsWith('.')) {
			this.warn(
				`@import ${JSON.stringify(specifier)} in ${importer} names ${real}, which is not a stylesheet, so it is left as written.`,
			);
			return {};
		}
		return { file: real };
	}

	private reaches(from: string, to: string): boolean {
		const seen = new Set<string>();
		const pending = [from];
		for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
			if (file === to) return true;
			if (seen.has(file)) continue;
			seen.add(file);
			pending.push(...(this.imports.get(file) ?? []));
		}
		return false;
	}

	/**
	 * Whether the `@import` of `target` from `importer` closes a cycle, which is then skipped with a warning.
	 *
	 * @remarks
	 * Lightning CSS drops the CSS of every stylesheet in a cycle, so the `@import` that closes it is removed instead,
	 * and each stylesheet in it is inlined once, as core does.
	 */
	private closesCycle(specifier: string, importer: string, target: string): boolean {
		if (!this.reaches(target, importer)) {
			this.imports.set(importer, (this.imports.get(importer) ?? new Set()).add(target));
			return false;
		}
		this.warn(
			`@import ${JSON.stringify(specifier)} in ${importer} names ${target}, which imports ${importer}, so it is skipped.`,
		);
		return true;
	}

	/**
	 * Reads one file for Lightning CSS: the entry from memory, a partial from disk with its `url()` references
	 * rebased onto the entry, and its external `@import`s taken out to be hoisted.
	 *
	 * @remarks
	 * Lightning CSS fails on an external `@import` that follows a bundled one, where core hoists them all to the top
	 * of the output, so they are removed here and put back by the caller.
	 */
	read(file: string): string {
		const importer = path.resolve(file);
		const isEntry = importer === this.entry;
		let css = isEntry ? this.source : fileSystem.readFileSync(importer);
		if (!isEntry) {
			this.dependencies.add(importer);
			css = rebaseStylesheetReferences(css, importer, this.entry);
		}
		return scanCss(css, {
			import: (statement) => {
				const { file: resolved } = this.resolveImport(statement.specifier, importer);
				if (!resolved) {
					this.hoisted.push(statement.statement);
					return '';
				}
				if (this.closesCycle(statement.specifier, importer, resolved)) return '';
				this.resolutions.set(resolutionKey(importer, statement.specifier), resolved);
				return undefined;
			},
		});
	}

	resolve(specifier: string, originatingFile: string): string {
		const resolved = this.resolutions.get(resolutionKey(path.resolve(originatingFile), specifier));
		if (!resolved) {
			throw new Error(
				`${originatingFile}: @import ${JSON.stringify(specifier)} was not resolved before bundling.`,
			);
		}
		return resolved;
	}
}

/**
 * Bundles the `@import`s of an app stylesheet with Lightning CSS.
 *
 * @remarks
 * `css` is the in-memory source of `file`, which may differ from the file on disk. A cycle of `@import`s and a
 * stylesheet imported twice are handled by Lightning CSS: the last import of a stylesheet wins, as the specification says.
 */
export async function bundleStylesheet(
	css: string,
	file: string,
	rootDir: string,
	options: ResolvedLightningCssOptions,
): Promise<BundledStylesheet> {
	const { bundleAsync } = await loadLightningCss();
	const entry = fileSystem.exists(file) ? fileSystem.realpath(file) : path.resolve(file);
	const bundle = new StylesheetBundle(entry, css, rootDir);
	const result = await bundleAsync({
		...options,
		filename: entry,
		resolver: {
			read: (source) => bundle.read(source),
			resolve: (specifier, originatingFile) => bundle.resolve(specifier, originatingFile),
		},
	});
	return {
		code: result.code,
		hoisted: bundle.hoisted,
		warnings: result.warnings,
		dependencies: [...bundle.dependencies].filter((dependency) => dependency !== entry),
	};
}
