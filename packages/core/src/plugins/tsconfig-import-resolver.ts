import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
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
	return fileSystem.exists(candidate) ? candidate : undefined;
}

function readJsonFile(filePath: string): unknown {
	const source = fileSystem.readFileSync(filePath);
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

/** The `compilerOptions` the TypeScript checker reads for module resolution, with every path made absolute. */
export interface TsconfigResolutionOptions {
	rootDirs?: string[];
	paths?: Record<string, string[]>;
}

/**
 * Loads `compilerOptions.rootDirs` and `compilerOptions.paths` from the tsconfig of `projectRoot`, following `extends`.
 *
 * @remarks
 * As in TypeScript, an option set in a config replaces the one it extends, and a relative path is relative to the
 * config that sets it. `baseUrl` is not applied. Returns `undefined` when the project has no readable tsconfig.
 */
export function loadTsconfigResolutionOptions(projectRoot: string): TsconfigResolutionOptions | undefined {
	const tsconfigPath = findTsconfigPath(projectRoot);
	if (!tsconfigPath) return undefined;
	const options: TsconfigResolutionOptions = {};
	const visited = new Set<string>();
	const collect = (configPath: string): void => {
		const normalized = path.resolve(configPath);
		if (visited.has(normalized)) return;
		visited.add(normalized);
		let config: {
			extends?: string;
			compilerOptions?: { rootDirs?: string[]; paths?: Record<string, string[]> };
		};
		try {
			config = readJsonFile(normalized) as typeof config;
		} catch {
			return;
		}
		const base = path.dirname(normalized);
		const { rootDirs, paths } = config.compilerOptions ?? {};
		if (rootDirs && !options.rootDirs) options.rootDirs = rootDirs.map((dir) => path.resolve(base, dir));
		if (paths && !options.paths) {
			options.paths = Object.fromEntries(
				Object.entries(paths).map(([key, targets]) => [
					key,
					targets.map((target) => path.resolve(base, target)),
				]),
			);
		}
		if (typeof config.extends === 'string') {
			const parent = path.resolve(base, config.extends);
			collect(fileSystem.exists(parent) ? parent : `${parent}.json`);
		}
	};
	collect(tsconfigPath);
	return options;
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
 * Drops what the bare package resolvers cached about the filesystem.
 *
 * @remarks
 * The resolvers cache directory lookups and symlink targets, so after a package install a specifier would keep
 * resolving to the file it reached before.
 */
export function clearBarePackageResolverCaches(): void {
	for (const resolver of browserPackageResolvers.values()) resolver.clearCache();
}

/**
 * Resolves a bare npm package entry for browser vendor prebundles.
 *
 * @param fromDirectory - Where resolution starts: the importing module's directory, since strict installs do
 * not expose a package's own dependencies at the root. Defaults to `projectRoot`.
 * @returns The entry `path` and the installed package's root `package.json`
 * (`packageJsonPath`), which stays the root manifest when the entry sits below a
 * nested one such as `cjs/package.json`.
 *
 * @remarks
 * Framework-owned dual packages such as `@ecopages/core` keep browser-first
 * `mainFields` and `conditionNames` so vendor prebundles pick the browser facade.
 * Third-party packages prefer ESM (`module` / `import`) and omit the `browser`
 * export condition so legacy UMD `exports.browser` entries cannot win during
 * Rolldown bundling.
 */
export function resolveBarePackageBrowserEntry(
	projectRoot: string,
	specifier: string,
	fromDirectory: string = projectRoot,
): { path: string; packageJsonPath?: string } | undefined {
	const browserFirst = usesBrowserFirstPackageResolution(specifier);
	const mainFields = browserFirst ? BROWSER_FIRST_MAIN_FIELDS : MODULE_FIRST_MAIN_FIELDS;
	const conditionNames = browserFirst ? BROWSER_FIRST_CONDITION_NAMES : MODULE_FIRST_CONDITION_NAMES;
	const result = getBrowserPackageResolver(projectRoot, mainFields, conditionNames).sync(fromDirectory, specifier);
	if (result.error || !result.path) {
		return undefined;
	}

	try {
		return {
			path: fileSystem.realpath(result.path),
			packageJsonPath: result.packageJsonPath && path.fromNative(result.packageJsonPath),
		};
	} catch {
		return {
			path: path.fromNative(result.path),
			packageJsonPath: result.packageJsonPath && path.fromNative(result.packageJsonPath),
		};
	}
}

function resolveAliasedBarrelTarget(resolvedPath: string): string {
	if (!path.basename(resolvedPath).startsWith('index.')) {
		return resolvedPath;
	}

	const source = fileSystem.readFileSync(resolvedPath).trim();
	const match = source.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?$/);

	if (!match?.[1]?.startsWith('.')) {
		return resolvedPath;
	}

	const targetDir = path.dirname(resolvedPath);
	const targetBase = path.resolve(targetDir, match[1]);

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const candidate = `${targetBase}${extension}`;
		if (fileSystem.exists(candidate)) {
			return candidate;
		}
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const candidate = path.join(targetBase, `index${extension}`);
		if (fileSystem.exists(candidate)) {
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
	if (fileSystem.exists(targetBase)) {
		return path.resolve(targetBase);
	}

	for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
		const candidate = `${targetBase}${candidateExtension}`;
		if (fileSystem.exists(candidate)) {
			return path.resolve(candidate);
		}
	}

	for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
		const candidate = path.join(targetBase, `index${candidateExtension}`);
		if (fileSystem.exists(candidate)) {
			return path.resolve(candidate);
		}
	}

	return undefined;
}

/**
 * Resolves a relative or tsconfig path alias import (via oxc-resolver).
 *
 * @remarks
 * A query or hash on the specifier, such as a module variant, is not part of the file and is dropped.
 * oxc-resolver returns native paths, so a result is converted to forward slashes like every other path core
 * compares; it is already real, since the resolver follows symbolic links.
 */
export function resolveProjectModulePath(
	projectRoot: string,
	fromFile: string,
	moduleSpecifier: string,
	options?: { preserveBarrel?: boolean },
): string | undefined {
	const specifier = moduleSpecifier.replace(/[?#].*$/u, '');
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
			const resolved = path.fromNative(result.path);
			return options?.preserveBarrel ? resolved : resolveAliasedBarrelTarget(resolved);
		}
	}

	if (isRelative) {
		const relativePath = resolveRelativeModulePath(fromFile, specifier);
		return relativePath && options?.preserveBarrel ? fileSystem.realpath(relativePath) : relativePath;
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

const packageStylesheetResolvers = new Map<string, ResolverFactoryType>();

function getPackageStylesheetResolver(conditionNames: readonly string[]): ResolverFactoryType {
	const key = conditionNames.join(',');
	let resolver = packageStylesheetResolvers.get(key);
	if (!resolver) {
		resolver = new ResolverFactory({ conditionNames: [...conditionNames], extensions: [] });
		packageStylesheetResolvers.set(key, resolver);
	}
	return resolver;
}

/**
 * Resolves a bare package specifier imported for its side effects to the stylesheet it names.
 *
 * @returns The real path of the stylesheet, or `undefined` when the specifier does not name one.
 *
 * @remarks
 * A specifier ending in `.css` (`pkg/style.css`) resolves through the package's `exports` with the `style`
 * condition first, then `browser`, `import` and `default`, and throws when the package does not provide it. Any
 * other specifier (`swiper/css`, `@fontsource/inter`) resolves as a browser script import would, without the
 * `style` condition, and names a stylesheet only when that resolves to a `.css` file, so a package whose entry is
 * a script is never read as its stylesheet.
 */
export function resolvePackageStylesheetPath(fromFile: string, specifier: string): string | undefined {
	const named = specifier.endsWith('.css');
	const conditionNames = named ? ['style', 'browser', 'import', 'default'] : ['browser', 'import', 'default'];
	const result = getPackageStylesheetResolver(conditionNames).sync(path.dirname(fromFile), specifier);
	if (!result.path) {
		if (named) {
			throw new Error(
				`[ecopages] Cannot resolve package stylesheet ${JSON.stringify(specifier)} from ${fromFile}${result.error ? `: ${result.error}` : ''}`,
			);
		}
		return undefined;
	}
	return result.path.endsWith('.css') ? fileSystem.realpath(result.path) : undefined;
}

const packageModuleResolver = new ResolverFactory({
	conditionNames: ['browser', 'import', 'default'],
	extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'],
});

/**
 * Resolves a bare package specifier, or a relative one inside a package, to the real path of the script it names.
 *
 * @returns The real path, or `undefined` when nothing resolves.
 *
 * @remarks
 * Resolves as a browser script import would, so discovery reads the same module a browser bundle holds.
 */
export function resolvePackageModulePath(fromFile: string, specifier: string): string | undefined {
	const result = packageModuleResolver.sync(path.dirname(fromFile), specifier);
	return result.path ? path.fromNative(result.path) : undefined;
}
