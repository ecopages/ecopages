import path from 'node:path';
import type { EcoComponentConfig } from '../types/contracts.ts';
import { resolvePackagePath } from '../utils/package-path.ts';
import { getDiscoveredStylesheets, getDiscoveredWatchFiles } from './discovered-dependencies.ts';

const PACKAGE_ENTRY_SEPARATOR = '|';

/**
 * Writes a package stylesheet as discovery stores it: the folder of the importing module, relative to the app
 * root, then the package path (`src/components|some-lib@1.2.0/css/style.css`).
 *
 * @remarks
 * The folder is where the package resolves from, as Node resolves it, and `|` never appears in either part.
 */
export function formatPackageStylesheetEntry(importerDir: string, packagePath: string): string {
	return `${importerDir}${PACKAGE_ENTRY_SEPARATOR}${packagePath}`;
}

function parsePackageStylesheetEntry(entry: string): { importerDir: string; packagePath: string } {
	const separator = entry.lastIndexOf(PACKAGE_ENTRY_SEPARATOR);
	return separator === -1
		? { importerDir: '', packagePath: entry }
		: { importerDir: entry.slice(0, separator), packagePath: entry.slice(separator + 1) };
}

/** The inferred stylesheets of one declaration as real paths of this app. */
export type ResolvedDiscoveredStylesheets = {
	imported: string[];
	plainModules: string[];
	/** The package path of each entry of `imported` or `plainModules` that a package import named. */
	packagePaths: ReadonlyMap<string, string>;
};

/**
 * Resolves the stylesheets discovery recorded for a declaration against `rootDir`.
 *
 * @remarks
 * A local stylesheet is stored relative to the app root and a package one by the folder of its importing module
 * and its package path ({@link formatPackageStylesheetEntry}). {@link resolvePackagePath} finds it from that folder
 * in the package installed now, so a moved build, another store layout or a linked workspace package's own
 * dependency resolves the file where it is, not where the build saw it.
 */
export function resolveDiscoveredStylesheets(
	config: EcoComponentConfig | undefined,
	rootDir: string,
): ResolvedDiscoveredStylesheets {
	const { imported, plainModules, packages } = getDiscoveredStylesheets(config);
	const packageEntries = new Set(packages);
	const packagePaths = new Map<string, string>();
	const resolve = (entry: string): string => {
		if (!packageEntries.has(entry)) return path.resolve(rootDir, entry);
		const { importerDir, packagePath } = parsePackageStylesheetEntry(entry);
		const file = resolvePackagePath(path.resolve(rootDir, importerDir), packagePath);
		packagePaths.set(file, packagePath);
		return file;
	};
	return { imported: imported.map(resolve), plainModules: plainModules.map(resolve), packagePaths };
}

/**
 * Every inferred stylesheet of a declaration that development watches, as real paths.
 *
 * @remarks
 * A package stylesheet installed under `node_modules` is left out, as the development watcher ignores that
 * directory; one in a linked workspace package stays a watch path.
 */
export function resolveInferredStylesheets(config: EcoComponentConfig | undefined, rootDir: string): string[] {
	const { imported, plainModules } = resolveDiscoveredStylesheets(config, rootDir);
	return [...imported, ...plainModules].filter((file) => !file.split(/[\\/]/).includes('node_modules'));
}

/** The watch files discovery recorded for a declaration, as paths of this app. */
export function resolveDiscoveredWatchFiles(config: EcoComponentConfig | undefined, rootDir: string): string[] {
	return getDiscoveredWatchFiles(config).map((file) => path.resolve(rootDir, file));
}
