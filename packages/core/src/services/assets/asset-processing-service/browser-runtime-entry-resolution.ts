import fs from 'node:fs';
import path from 'node:path';
import type { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isBarePackageImportSpecifier } from '../../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../../plugins/package-specifier.ts';

export type BrowserRuntimeDefaultExportPolicy = 'emit-default' | 'skip-default';

type RequireFromRoot = ReturnType<typeof createRequire>;

/**
 * Resolves a package specifier through Node's ESM import conditions from the app root.
 */
export function resolvePackageEsmEntryPath(specifier: string, rootDir: string): string | undefined {
	try {
		return fileURLToPath(import.meta.resolve(specifier, pathToFileURL(path.join(rootDir, 'package.json')).href));
	} catch {
		return undefined;
	}
}

function resolveLegacyPackageModuleEntry(options: {
	specifier: string;
	requireFromRoot: RequireFromRoot;
	rootDir: string;
}): string | undefined {
	if (!isBarePackageImportSpecifier(options.specifier, options.rootDir)) {
		return undefined;
	}

	const packageRoot = toPackageRootSpecifier(options.specifier);
	if (options.specifier !== packageRoot) {
		return undefined;
	}

	try {
		const packageJsonPath = options.requireFromRoot.resolve(`${packageRoot}/package.json`);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
			exports?: unknown;
			module?: unknown;
		};
		if (packageJson.exports !== undefined || typeof packageJson.module !== 'string') {
			return undefined;
		}

		const modulePath = path.resolve(path.dirname(packageJsonPath), packageJson.module);
		return fs.existsSync(modulePath) ? modulePath : undefined;
	} catch {
		return undefined;
	}
}

const ESM_DEFAULT_EXPORT = /\bexport\s+default\b/;
const ESM_NAMED_EXPORT = /\bexport\s+(?:[\w*{]|const|let|var|function|class)/;
const EXPORTABLE_BINDING_NAME = /^[$A-Z_a-z][$\w]*$/;

/**
 * Resolves a browser runtime specifier to the absolute file that the generated
 * vendor entry will import, when that import is a path.
 *
 * @remarks
 * `node:` specifiers have no file path. `file:` URLs are converted to paths.
 */
export function resolveBrowserRuntimeEntryPath(options: {
	specifier: string;
	requireFromRoot: RequireFromRoot;
	rootDir: string;
}): string | undefined {
	const { specifier, requireFromRoot, rootDir } = options;

	if (specifier.startsWith('node:')) {
		return undefined;
	}

	if (specifier.startsWith('file:')) {
		return fileURLToPath(specifier);
	}

	if (specifier.startsWith('.')) {
		return requireFromRoot.resolve(specifier);
	}

	const esmResolvedPath = isBarePackageImportSpecifier(specifier, rootDir)
		? resolvePackageEsmEntryPath(specifier, rootDir)
		: undefined;
	const legacyModulePath = resolveLegacyPackageModuleEntry({ specifier, requireFromRoot, rootDir });
	if (legacyModulePath) {
		return legacyModulePath;
	}
	if (esmResolvedPath) {
		return esmResolvedPath;
	}

	try {
		const resolvedPath = requireFromRoot.resolve(specifier);
		const esmSibling = resolvedPath.endsWith('.cjs')
			? `${resolvedPath.slice(0, -4)}.js`
			: resolvedPath.endsWith('.cts')
				? `${resolvedPath.slice(0, -4)}.ts`
				: undefined;

		return esmSibling && fs.existsSync(esmSibling) ? esmSibling : resolvedPath;
	} catch {
		return undefined;
	}
}

/**
 * Builds a relative import path from a generated runtime entry file to a resolved module path.
 */
export function toRelativeEntryImport(entryDir: string, resolvedPath: string): string {
	let relativePath = path.relative(entryDir, resolvedPath).replace(/\\/g, '/');

	if (!relativePath.startsWith('.')) {
		relativePath = `./${relativePath}`;
	}

	return relativePath;
}

/**
 * Resolves a browser runtime entry import to an ESM file path when possible.
 *
 * @remarks
 * Browser vendor entries resolve through ESM import conditions first. A package
 * root without `exports` may instead select its legacy `module` field; CJS
 * resolution is the final compatibility fallback.
 */
export function resolveBrowserRuntimeEntryImport(options: {
	specifier: string;
	requireFromRoot: RequireFromRoot;
	entryDir: string;
	rootDir: string;
}): string {
	const { specifier, requireFromRoot, entryDir, rootDir } = options;

	if (specifier.startsWith('node:') || specifier.startsWith('file:')) {
		return specifier;
	}

	const entryPath = resolveBrowserRuntimeEntryPath({ specifier, requireFromRoot, rootDir });
	if (!entryPath) {
		throw new Error(`Unable to resolve browser runtime entry for "${specifier}" from "${rootDir}"`);
	}

	return toRelativeEntryImport(entryDir, entryPath);
}

/**
 * Decides whether a generated runtime entry should re-export a default binding.
 *
 * @remarks
 * ESM-only packages such as `@tanstack/react-query` expose named exports only.
 * Legacy CJS packages such as `react` assign `module.exports` directly and have
 * no `.default` under `require()`, but still need a default re-export for
 * `import React from 'react'` in browser bundles.
 *
 * ESM source inspection is a best-effort fast path; when it is inconclusive the
 * policy falls back to the shape returned by `require()`.
 */
export function inferBrowserRuntimeDefaultExportPolicy(options: {
	specifier: string;
	requireFromRoot: RequireFromRoot;
	rootDir: string;
}): BrowserRuntimeDefaultExportPolicy {
	const { specifier, requireFromRoot, rootDir } = options;
	const entryPath = resolveBrowserRuntimeEntryPath({ specifier, requireFromRoot, rootDir });
	if (entryPath && fs.existsSync(entryPath)) {
		const source = fs.readFileSync(entryPath, 'utf8');
		if (ESM_DEFAULT_EXPORT.test(source)) {
			return 'emit-default';
		}

		if (ESM_NAMED_EXPORT.test(source)) {
			return 'skip-default';
		}
	}

	try {
		const moduleExports = requireFromRoot(specifier) as { default?: unknown; __esModule?: boolean };
		if (moduleExports.default !== undefined) {
			return 'emit-default';
		}

		return moduleExports.__esModule === true ? 'skip-default' : 'emit-default';
	} catch {
		return 'skip-default';
	}
}

/**
 * Returns true when the resolved vendor file is an ESM module that Rolldown can
 * re-export with `export *`.
 *
 * @remarks
 * React's published "import" files are still CJS wrappers. `export *` from those
 * files does not emit named ESM bindings such as `jsx`.
 */
export function browserRuntimeEntryHasEsmExports(entryPath: string | undefined): boolean {
	if (!entryPath || !fs.existsSync(entryPath)) {
		return true;
	}

	const source = fs.readFileSync(entryPath, 'utf8');
	return ESM_DEFAULT_EXPORT.test(source) || ESM_NAMED_EXPORT.test(source);
}

/**
 * Reads enumerable CJS exports from the same file the generated entry imports.
 *
 * @remarks
 * Used only when {@link browserRuntimeEntryHasEsmExports} is false. ESM entries
 * must not harvest names from `require()`, which copies class statics that are
 * not ESM named exports.
 */
export function listBrowserRuntimeCjsExportNames(moduleId: string, requireFromRoot: RequireFromRoot): string[] {
	let moduleExports: Record<string, unknown>;
	try {
		moduleExports = requireFromRoot(moduleId) as Record<string, unknown>;
	} catch {
		return [];
	}

	return Object.keys(moduleExports)
		.filter((name) => name !== '__esModule' && name !== 'default')
		.filter((name) => EXPORTABLE_BINDING_NAME.test(name))
		.sort();
}
