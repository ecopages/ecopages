import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ResolverFactory, type ResolverFactory as ResolverFactoryType } from 'oxc-resolver';

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
	if (!resolver) {
		return undefined;
	}

	const result = resolver.sync(path.dirname(fromFile), specifier);
	if (!result.path) {
		return undefined;
	}

	return resolveAliasedBarrelTarget(realpathSync(result.path));
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
