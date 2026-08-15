import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isBarePackageImportSpecifier } from '../../plugins/tsconfig-import-resolver.ts';

const corePackageRequire = createRequire(new URL('../../../package.json', import.meta.url));
const appDeclaredPackageCache = new Map<string, Set<string>>();
const appWorkspacePackageCache = new Map<string, Set<string>>();

function tryResolveRuntimeImport(specifier: string, resolver: NodeJS.Require): string | undefined {
	try {
		return resolver.resolve(specifier);
	} catch {
		return undefined;
	}
}

/**
 * Extracts the package name from a file:// URL pointing to a node_modules path.
 *
 * @remarks
 * Given a URL like `file:///path/to/node_modules/@scope/pkg/dist/index.js`,
 * returns `@scope/pkg`. Given `file:///path/to/node_modules/pkg/dist/index.js`,
 * returns `pkg`. Returns `undefined` if the URL doesn't point to node_modules.
 *
 * Handles pnpm's nested node_modules structure by finding the LAST node_modules
 * in the path (e.g., `node_modules/.pnpm/pkg@version/node_modules/@scope/pkg/...`).
 */
function extractPackageNameFromFileUrl(specifier: string): string | undefined {
	if (!specifier.startsWith('file://')) {
		return undefined;
	}

	// Find the LAST node_modules in the path to handle pnpm's nested structure
	const lastNodeModulesIndex = specifier.lastIndexOf('/node_modules/');
	if (lastNodeModulesIndex === -1) {
		return undefined;
	}

	const afterNodeModules = specifier.slice(lastNodeModulesIndex + '/node_modules/'.length);
	const parts = afterNodeModules.split('/');

	if (parts.length === 0) {
		return undefined;
	}

	if (parts[0]?.startsWith('@') && parts.length > 1) {
		return `${parts[0]}/${parts[1]}`;
	}

	return parts[0];
}

function getPackageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		return specifier.split('/').slice(0, 2).join('/');
	}

	return specifier.split('/')[0] ?? specifier;
}

function getDeclaredAppPackages(rootDir: string): Set<string> {
	const cacheKey = path.resolve(rootDir);
	const cached = appDeclaredPackageCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const packageJsonPath = path.resolve(rootDir, 'package.json');
	const declaredPackages = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}

			for (const packageName of Object.keys(entries as Record<string, unknown>)) {
				declaredPackages.add(packageName);
			}
		}
	} catch {
		appDeclaredPackageCache.set(cacheKey, declaredPackages);
		return declaredPackages;
	}

	appDeclaredPackageCache.set(cacheKey, declaredPackages);
	return declaredPackages;
}

/**
 * Returns the set of workspace packages declared in the app's package.json.
 *
 * Workspace packages are identified by the `workspace:` protocol in their
 * version specifier (e.g., `"workspace:*"`, `"workspace:^1.0.0"`). These
 * packages are typically source-only and must be bundled rather than
 * externalized.
 */
function getWorkspacePackages(rootDir: string): Set<string> {
	const cacheKey = path.resolve(rootDir);
	const cached = appWorkspacePackageCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const packageJsonPath = path.resolve(rootDir, 'package.json');
	const workspacePackages = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}

			for (const [packageName, version] of Object.entries(entries as Record<string, unknown>)) {
				if (typeof version === 'string' && version.startsWith('workspace:')) {
					workspacePackages.add(packageName);
				}
			}
		}
	} catch {
		appWorkspacePackageCache.set(cacheKey, workspacePackages);
		return workspacePackages;
	}

	appWorkspacePackageCache.set(cacheKey, workspacePackages);
	return workspacePackages;
}

/**
 * Returns true if the given specifier is a workspace package.
 *
 * Workspace packages are declared with the `workspace:` protocol and are
 * typically source-only, requiring bundling rather than externalization.
 */
export function isWorkspacePackageImport(specifier: string, rootDir: string): boolean {
	return getWorkspacePackages(rootDir).has(getPackageNameFromSpecifier(specifier));
}

export function isDeclaredAppPackageImport(specifier: string, rootDir: string): boolean {
	return getDeclaredAppPackages(rootDir).has(getPackageNameFromSpecifier(specifier));
}

/**
 * Whether the given bare specifier should be left as-is (not rewritten to a
 * file URL) in bundled output.
 *
 * Only app-declared packages qualify: their resolver can find them from a
 * generated server bundle. Core dependencies remain file URLs because a
 * bundle in `dist/.server` is not inside Core's Node.js resolution chain.
 */
function isDeclaredInResolutionChain(specifier: string, rootDir: string): boolean {
	return isDeclaredAppPackageImport(specifier, rootDir);
}

function rewriteRuntimeImportSpecifier(specifier: string, quote: string, rootDir: string): string | undefined {
	if (!isBarePackageImportSpecifier(specifier, rootDir)) {
		return undefined;
	}

	if (isDeclaredInResolutionChain(specifier, rootDir)) {
		return undefined;
	}

	const resolvedPath = tryResolveRuntimeImport(specifier, corePackageRequire);
	if (!resolvedPath || !/\.(?:[cm]?[jt]s|tsx|jsx)$/u.test(resolvedPath)) {
		return undefined;
	}

	return `${quote}${pathToFileURL(resolvedPath).href}${quote}`;
}

function rewriteRuntimeBuildOutputImports(code: string, rootDir: string): string {
	const rewriteSpecifier = (prefix: string, quote: string, specifier: string) => {
		const rewrittenSpecifier = rewriteRuntimeImportSpecifier(specifier, quote, rootDir);
		return `${prefix}${rewrittenSpecifier ?? `${quote}${specifier}${quote}`}`;
	};

	/**
	 * Rewrites file:// URLs pointing to node_modules back to bare specifiers,
	 * but only when the package is resolvable from the app's resolution chain.
	 *
	 * @remarks
	 * Rolldown resolves external imports to file:// URLs during the build. For
	 * packages declared in the app's package.json, rewriting to bare specifiers
	 * is safe and preserves CJS named-export interop. For transitive
	 * dependencies that aren't directly resolvable, the file:// URL is kept as-is
	 * to avoid ERR_MODULE_NOT_FOUND errors at runtime.
	 */
	const rewriteFileUrl = (prefix: string, quote: string, specifier: string) => {
		const packageName = extractPackageNameFromFileUrl(specifier);
		if (!packageName) {
			return `${prefix}${quote}${specifier}${quote}`;
		}

		if (!isDeclaredInResolutionChain(packageName, rootDir)) {
			return `${prefix}${quote}${specifier}${quote}`;
		}

		// Extract the subpath after the package name
		// Use lastIndexOf to handle pnpm's nested node_modules structure
		const lastNodeModulesIndex = specifier.lastIndexOf('/node_modules/');
		if (lastNodeModulesIndex === -1) {
			return `${prefix}${quote}${specifier}${quote}`;
		}

		const afterNodeModules = specifier.slice(lastNodeModulesIndex + '/node_modules/'.length);
		const afterPackage = afterNodeModules.slice(packageName.length);

		// Reconstruct the bare specifier
		const bareSpecifier = packageName + afterPackage;
		return `${prefix}${quote}${bareSpecifier}${quote}`;
	};

	const withResolvedPackages = code
		.replace(/(\bfrom\s+)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		)
		.replace(/(\bimport\s+)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		)
		.replace(/(\bimport\s*\(\s*)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		);

	// Rewrite file:// URLs pointing to node_modules back to bare specifiers
	const withBareSpecifiers = withResolvedPackages
		.replace(/(\bfrom\s+)(['"])(file:\/\/[^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteFileUrl(prefix, quote, specifier),
		)
		.replace(/(\bimport\s+)(['"])(file:\/\/[^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteFileUrl(prefix, quote, specifier),
		)
		.replace(/(\bimport\s*\(\s*)(['"])(file:\/\/[^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteFileUrl(prefix, quote, specifier),
		);

	return withBareSpecifiers.replace(
		/(['"])(@oxc-project\/runtime\/(?:helpers(?:\/esm)?\/[^'"\\]+))\1/g,
		(match, quote, specifier) => {
			const resolvedPath = tryResolveRuntimeImport(specifier as string, corePackageRequire);
			return resolvedPath ? `${quote}${pathToFileURL(resolvedPath).href}${quote}` : match;
		},
	);
}

export function normalizeNodeRuntimeBuildOutputFile(filePath: string, rootDir: string): void {
	if (process.env.ECOPAGES_LOGGER_DEBUG === 'true') {
		console.log(`[normalizeNodeRuntimeBuildOutputFile] Checking ${filePath}`);
	}
	if (!/\.(?:[cm]?js)$/u.test(filePath)) {
		return;
	}

	const fileSystem = corePackageRequire('node:fs') as typeof import('node:fs');
	if (!fileSystem.existsSync(filePath)) {
		return;
	}

	const code = fileSystem.readFileSync(filePath, 'utf-8');
	const rewritten = rewriteRuntimeBuildOutputImports(code, rootDir);
	if (rewritten !== code) {
		if (process.env.ECOPAGES_LOGGER_DEBUG === 'true') {
			console.log(`[normalizeNodeRuntimeBuildOutputFile] Rewriting ${filePath}`);
		}
		fileSystem.writeFileSync(filePath, rewritten);
	}
}

export function normalizeNodeRuntimeBuildOutputs(outputPaths: string[], rootDir: string): void {
	for (const outputPath of outputPaths) {
		normalizeNodeRuntimeBuildOutputFile(outputPath, rootDir);
	}
}
