import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isBarePackageImportSpecifier } from '../../../plugins/tsconfig-import-resolver.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../../../config/constants.ts';

export type BrowserRuntimeEntryModuleConfig = {
	specifier: string;
	defaultExport?: boolean;
};

/**
 * Creates a generated ESM entry module that re-exports runtime modules through
 * one stable file.
 *
 * @remarks
 * Integrations use this helper when they need a browser runtime asset composed
 * from multiple bare specifiers but do not want to own temporary file assembly
 * logic themselves. The generated file lives under the app work directory so
 * repeated runs can reuse the same location without placing sources inside
 * `node_modules`, which can cause bundlers to externalize bare imports.
 */
export function createBrowserRuntimeEntryModule(options: {
	modules: BrowserRuntimeEntryModuleConfig[];
	fileName: string;
	rootDir?: string;
	workDir?: string;
	cacheDirName?: string;
}): string {
	if (options.modules.some((module) => !module.specifier.startsWith('node:')) && !options.rootDir) {
		throw new Error('createBrowserRuntimeEntryModule requires rootDir to resolve package specifiers');
	}

	const rootDir = options.rootDir ?? process.cwd();
	const workDir = options.workDir ?? path.join(rootDir, DEFAULT_ECOPAGES_WORK_DIR);
	const artifactsDir = path.join(
		workDir,
		'.browser-runtime-entries',
		options.cacheDirName ?? 'ecopages-browser-runtime',
	);
	fs.mkdirSync(artifactsDir, { recursive: true });

	const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
	const seenExports = new Set<string>();
	const statements: string[] = [];
	const filePath = path.join(artifactsDir, options.fileName);
	const entryDir = path.dirname(filePath);

	for (const module of options.modules) {
		const importSpecifier = resolveEntryImportSpecifier(module.specifier, requireFromRoot, entryDir, rootDir);

		if (module.defaultExport && shouldEmitDefaultReExport(module.specifier, requireFromRoot, rootDir)) {
			statements.push(`import __ecopages_default_export__ from '${importSpecifier}';`);
			statements.push('export default __ecopages_default_export__;');
		}

		const exportNames = getModuleExportNames(module.specifier, requireFromRoot).filter(
			(name) => !seenExports.has(name),
		);

		if (exportNames.length > 0) {
			statements.push(`export { ${exportNames.join(', ')} } from '${importSpecifier}';`);
			for (const exportName of exportNames) {
				seenExports.add(exportName);
			}
		}
	}

	const content = statements.join('\n');
	if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf-8') !== content) {
		fs.writeFileSync(filePath, content, 'utf-8');
	}
	return filePath;
}

function toRelativeEntryImport(entryDir: string, resolvedPath: string): string {
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
function resolveEntryImportSpecifier(
	specifier: string,
	requireFromRoot: ReturnType<typeof createRequire>,
	entryDir: string,
	rootDir: string,
): string {
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

function resolvePackageEsmEntryPath(specifier: string, rootDir: string): string | undefined {
	try {
		return fileURLToPath(import.meta.resolve(specifier, pathToFileURL(path.join(rootDir, 'package.json')).href));
	} catch {
		return undefined;
	}
}

/**
 * Returns true when a generated runtime entry should re-export a default binding.
 *
 * @remarks
 * ESM-only packages such as `@tanstack/react-query` expose named exports only.
 * Legacy CJS packages such as `react` assign `module.exports` directly and have
 * no `.default` under `require()`, but still need a default re-export for
 * `import React from 'react'` in browser bundles.
 */
function shouldEmitDefaultReExport(
	specifier: string,
	requireFromRoot: ReturnType<typeof createRequire>,
	rootDir: string,
): boolean {
	const esmPath = resolvePackageEsmEntryPath(specifier, rootDir);
	if (esmPath && fs.existsSync(esmPath)) {
		const source = fs.readFileSync(esmPath, 'utf8');
		if (/\bexport\s+default\b/.test(source)) {
			return true;
		}

		if (/\bexport\s+(?:[\w*{]|const|let|var|function|class)/.test(source)) {
			return false;
		}
	}

	try {
		const moduleExports = requireFromRoot(specifier) as { default?: unknown; __esModule?: boolean };
		if (moduleExports.default !== undefined) {
			return true;
		}

		return moduleExports.__esModule !== true;
	} catch {
		return false;
	}
}

/**
 * Reads the named runtime exports that should be re-exported from a generated
 * runtime entry module.
 *
 * @remarks
 * Default exports are handled separately because generated runtime entry files
 * need to emit a synthetic default binding only when the caller explicitly asks
 * for it.
 */
function getModuleExportNames(specifier: string, requireFromRoot: ReturnType<typeof createRequire>): string[] {
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
