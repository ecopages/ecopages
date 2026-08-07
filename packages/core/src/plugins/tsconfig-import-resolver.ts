import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ResolverFactory, type ResolverFactory as ResolverFactoryType } from 'oxc-resolver';
import { toPackageRootSpecifier } from './package-specifier.ts';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mdx'] as const;

const resolverCache = new Map<string, ResolverFactoryType>();
const pathPrefixCache = new Map<string, string[]>();

function stripJsonComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function findTsconfigPath(projectRoot: string): string | undefined {
	const candidate = path.join(projectRoot, 'tsconfig.json');
	return existsSync(candidate) ? candidate : undefined;
}

function readJsonFile(filePath: string): unknown {
	const source = readFileSync(filePath, 'utf8');
	try {
		return JSON.parse(source);
	} catch {
		return JSON.parse(stripJsonComments(source));
	}
}

/**
 * Loads `compilerOptions.paths` keys from tsconfig, following `extends` recursively.
 */
export function loadTsconfigPathPrefixes(projectRoot: string): string[] {
	const cached = pathPrefixCache.get(projectRoot);
	if (cached) {
		return cached;
	}

	const tsconfigPath = findTsconfigPath(projectRoot);
	if (!tsconfigPath) {
		pathPrefixCache.set(projectRoot, []);
		return [];
	}

	const prefixes = new Set<string>();
	const visited = new Set<string>();

	const collectFromConfig = (configPath: string) => {
		const normalized = path.resolve(configPath);
		if (visited.has(normalized)) {
			return;
		}

		visited.add(normalized);

		let config: { extends?: string; compilerOptions?: { paths?: Record<string, string[]> } };
		try {
			config = readJsonFile(normalized) as typeof config;
		} catch {
			return;
		}

		if (typeof config.extends === 'string') {
			const parentPath = path.resolve(path.dirname(normalized), config.extends);
			collectFromConfig(parentPath);
		}

		for (const key of Object.keys(config.compilerOptions?.paths ?? {})) {
			if (key.endsWith('/*')) {
				prefixes.add(key.slice(0, -1));
				continue;
			}

			if (key.endsWith('*')) {
				prefixes.add(key.slice(0, -1));
				continue;
			}

			prefixes.add(key);
		}
	};

	collectFromConfig(tsconfigPath);
	const resolvedPrefixes = [...prefixes];
	pathPrefixCache.set(projectRoot, resolvedPrefixes);
	return resolvedPrefixes;
}

export function matchesTsconfigPathPrefix(specifier: string, prefixes: readonly string[]): boolean {
	return prefixes.some((prefix) => {
		if (prefix.endsWith('/')) {
			return specifier.startsWith(prefix);
		}

		return specifier === prefix || specifier.startsWith(`${prefix}/`);
	});
}

/**
 * Returns true when `specifier` looks like a bare npm package import rather than
 * a relative path, absolute path, node built-in, tsconfig alias, or `#` import map.
 */
export function isBarePackageImportSpecifier(specifier: string, projectRoot?: string): boolean {
	if (specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('/')) {
		return false;
	}

	if (specifier.startsWith('node:') || specifier.startsWith('#') || specifier.includes(':')) {
		return false;
	}

	if (projectRoot && matchesTsconfigPathPrefix(specifier, loadTsconfigPathPrefixes(projectRoot))) {
		return false;
	}

	return true;
}

function getResolverFactory(projectRoot: string): ResolverFactoryType | undefined {
	const cached = resolverCache.get(projectRoot);
	if (cached) {
		return cached;
	}

	const tsconfigPath = findTsconfigPath(projectRoot);
	if (!tsconfigPath) {
		return undefined;
	}

	const resolver = new ResolverFactory({
		tsconfig: {
			configFile: tsconfigPath,
		},
		extensions: [...RESOLVABLE_EXTENSIONS],
	});
	resolverCache.set(projectRoot, resolver);
	return resolver;
}

const BROWSER_FIRST_CONDITION_NAMES = ['browser', 'module', 'import', 'default'] as const;
/**
 * Omit `browser` so package `exports` cannot select a legacy UMD facade when both
 * `browser` and `import` conditions are published. Legacy `mainFields.browser`
 * remains available after `module` for packages without `exports`.
 */
const MODULE_FIRST_CONDITION_NAMES = ['module', 'import', 'default'] as const;
const BROWSER_FIRST_MAIN_FIELDS = ['browser', 'module', 'main'] as const;
const MODULE_FIRST_MAIN_FIELDS = ['module', 'browser', 'main'] as const;

/**
 * Package roots that ship an explicit browser facade and must keep browser-first
 * resolution during vendor prebundles.
 *
 * @remarks
 * Prefer expanding this set only for dual packages whose `"browser"` / `exports.browser`
 * entry is the intentional client facade (for example `@ecopages/core`).
 */
const BROWSER_FIRST_PACKAGE_ROOTS = new Set<string>(['@ecopages/core']);

const browserPackageResolvers = new Map<string, ResolverFactoryType>();

function usesBrowserFirstPackageResolution(specifier: string): boolean {
	const packageRoot = toPackageRootSpecifier(specifier);
	return BROWSER_FIRST_PACKAGE_ROOTS.has(packageRoot);
}

function getBrowserPackageResolver(
	projectRoot: string,
	mainFields: readonly string[],
	conditionNames: readonly string[],
): ResolverFactoryType {
	const normalizedRoot = path.resolve(projectRoot);
	const cacheKey = `${normalizedRoot}\0${mainFields.join(',')}\0${conditionNames.join(',')}`;
	const cached = browserPackageResolvers.get(cacheKey);
	if (cached) {
		return cached;
	}

	const resolver = new ResolverFactory({
		conditionNames: [...conditionNames],
		mainFields: [...mainFields],
		extensions: [...RESOLVABLE_EXTENSIONS],
	});
	browserPackageResolvers.set(cacheKey, resolver);
	return resolver;
}

/**
 * Resolves a bare npm package entry for browser vendor prebundles.
 *
 * @remarks
 * Framework-owned dual packages such as `@ecopages/core` keep browser-first
 * `mainFields` and `conditionNames` so vendor prebundles pick the browser facade.
 * Third-party packages prefer ESM (`module` / `import`) and omit the `browser`
 * export condition so legacy UMD `exports.browser` entries cannot win during
 * Rolldown bundling.
 */
export function resolveBarePackageBrowserEntry(projectRoot: string, specifier: string): string | undefined {
	const browserFirst = usesBrowserFirstPackageResolution(specifier);
	const mainFields = browserFirst ? BROWSER_FIRST_MAIN_FIELDS : MODULE_FIRST_MAIN_FIELDS;
	const conditionNames = browserFirst ? BROWSER_FIRST_CONDITION_NAMES : MODULE_FIRST_CONDITION_NAMES;
	const result = getBrowserPackageResolver(projectRoot, mainFields, conditionNames).sync(projectRoot, specifier);
	if (result.error || !result.path) {
		return undefined;
	}

	try {
		return realpathSync(result.path);
	} catch {
		return result.path;
	}
}

function resolveAliasedBarrelTarget(resolvedPath: string): string {
	if (!path.basename(resolvedPath).startsWith('index.')) {
		return resolvedPath;
	}

	const source = readFileSync(resolvedPath, 'utf8').trim();
	const match = source.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?$/);

	if (!match?.[1]?.startsWith('.')) {
		return resolvedPath;
	}

	const targetDir = path.dirname(resolvedPath);
	const targetBase = path.resolve(targetDir, match[1]);

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const candidate = `${targetBase}${extension}`;
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const candidate = path.join(targetBase, `index${extension}`);
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return resolvedPath;
}

/**
 * Resolves a relative import against the filesystem without requiring tsconfig.
 *
 * @remarks
 * Used when oxc-resolver has no tsconfig (minimal fixtures / apps without paths)
 * and as a fallback when the resolver cannot locate a relative specifier.
 */
export function resolveRelativeModulePath(fromFile: string, specifier: string): string | undefined {
	if (!specifier.startsWith('.')) {
		return undefined;
	}

	const targetBase = path.resolve(path.dirname(fromFile), specifier);
	if (existsSync(targetBase)) {
		return path.resolve(targetBase);
	}

	for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
		const candidate = `${targetBase}${candidateExtension}`;
		if (existsSync(candidate)) {
			return path.resolve(candidate);
		}
	}

	for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
		const candidate = path.join(targetBase, `index${candidateExtension}`);
		if (existsSync(candidate)) {
			return path.resolve(candidate);
		}
	}

	return undefined;
}

/**
 * Resolves a relative or tsconfig path alias import (via oxc-resolver).
 */
export function resolveProjectModulePath(projectRoot: string, fromFile: string, specifier: string): string | undefined {
	const prefixes = loadTsconfigPathPrefixes(projectRoot);
	const isRelative = specifier.startsWith('.');
	const isPathAlias = matchesTsconfigPathPrefix(specifier, prefixes);

	if (!isRelative && !isPathAlias) {
		return undefined;
	}

	const resolver = getResolverFactory(projectRoot);
	if (resolver) {
		const result = resolver.sync(path.dirname(fromFile), specifier);
		if (result.path) {
			return resolveAliasedBarrelTarget(realpathSync(result.path));
		}
	}

	if (isRelative) {
		return resolveRelativeModulePath(fromFile, specifier);
	}

	return undefined;
}

/**
 * Resolves a TS path alias import using the app's tsconfig `paths` (via oxc-resolver).
 */
export function resolveProjectImportPath(projectRoot: string, fromFile: string, specifier: string): string | undefined {
	if (!matchesTsconfigPathPrefix(specifier, loadTsconfigPathPrefixes(projectRoot))) {
		return undefined;
	}

	return resolveProjectModulePath(projectRoot, fromFile, specifier);
}
