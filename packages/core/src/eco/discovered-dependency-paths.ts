import path from 'node:path';
import type { EcoComponentConfig } from '../types/contracts.ts';
import { resolvePackagePath } from '../utils/package-path.ts';
import { getDiscoveredStylesheets, getDiscoveredWatchFiles } from './discovered-dependencies.ts';

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
 * A local stylesheet is stored relative to the app root and a package one by its package path, which
 * {@link resolvePackagePath} finds in the package installed now, so a moved build or a bumped dependency
 * resolves the file where it is, not where the build saw it.
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
		const file = resolvePackagePath(rootDir, entry);
		packagePaths.set(file, entry);
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
