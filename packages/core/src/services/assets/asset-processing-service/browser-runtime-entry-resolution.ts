import fs from 'node:fs';
import path from 'node:path';
import type { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isBarePackageImportSpecifier } from '../../../plugins/tsconfig-import-resolver.ts';

export type BrowserRuntimeDefaultExportPolicy = 'emit-default' | 'skip-default';

type RequireFromRoot = ReturnType<typeof createRequire>;

/**
 * Resolves a package specifier to its ESM entry file path from the app root.
 */
export function resolvePackageEsmEntryPath(specifier: string, rootDir: string): string | undefined {
	try {
		return fileURLToPath(import.meta.resolve(specifier, pathToFileURL(path.join(rootDir, 'package.json')).href));
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
 * `createRequire().resolve()` follows the `require` export condition and can
 * land on `.cjs` entrypoints. Browser vendor bundles then emit runtime
 * `require()` calls for React externals. Prefer Node's ESM resolver first, then
 * a `.cjs` → `.js` sibling fallback.
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

	if (specifier.startsWith('.')) {
		const resolvedPath = requireFromRoot.resolve(specifier);
		return toRelativeEntryImport(entryDir, resolvedPath);
	}

	if (isBarePackageImportSpecifier(specifier, rootDir)) {
		const esmResolvedPath = resolvePackageEsmEntryPath(specifier, rootDir);
		if (esmResolvedPath) {
			return toRelativeEntryImport(entryDir, esmResolvedPath);
		}
	}

	const resolvedPath = requireFromRoot.resolve(specifier);
	const esmSibling = resolvedPath.endsWith('.cjs')
		? `${resolvedPath.slice(0, -4)}.js`
		: resolvedPath.endsWith('.cts')
			? `${resolvedPath.slice(0, -4)}.ts`
			: undefined;

	if (esmSibling && fs.existsSync(esmSibling)) {
		return toRelativeEntryImport(entryDir, esmSibling);
	}

	return toRelativeEntryImport(entryDir, resolvedPath);
}

/**
 * Decides whether a generated runtime entry should re-export a default binding.
 *
 * @remarks
 * ESM-only packages such as `@tanstack/react-query` expose named exports only.
 * Legacy CJS packages such as `react` assign `module.exports` directly and have
 * no `.default` under `require()`, but still need a default re-export for
 * `import React from 'react'` in browser bundles.
 */
export function inferBrowserRuntimeDefaultExportPolicy(options: {
	specifier: string;
	requireFromRoot: RequireFromRoot;
	rootDir: string;
}): BrowserRuntimeDefaultExportPolicy {
	const { specifier, requireFromRoot, rootDir } = options;
	const esmPath = resolvePackageEsmEntryPath(specifier, rootDir);
	if (esmPath && fs.existsSync(esmPath)) {
		const source = fs.readFileSync(esmPath, 'utf8');
		if (/\bexport\s+default\b/.test(source)) {
			return 'emit-default';
		}

		if (/\bexport\s+(?:[\w*{]|const|let|var|function|class)/.test(source)) {
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
 * Reads the named runtime exports that should be re-exported from a generated runtime entry module.
 *
 * @remarks
 * Default exports are handled separately because generated runtime entry files need to emit a
 * synthetic default binding only when the caller explicitly asks for it.
 */
export function listBrowserRuntimeModuleExportNames(specifier: string, requireFromRoot: RequireFromRoot): string[] {
	let moduleExports: Record<string, unknown>;
	try {
		moduleExports = requireFromRoot(specifier) as Record<string, unknown>;
	} catch {
		return [];
	}

	return Object.keys(moduleExports)
		.filter((name) => name !== '__esModule' && name !== 'default')
		.filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name))
		.sort();
}
