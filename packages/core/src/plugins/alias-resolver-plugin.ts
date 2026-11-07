import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { escapeRegExp } from '../utils/regex-escaping.ts';
import { AliasResolverCache } from './alias-resolver-cache.ts';
import { loadTsconfigPathPrefixes, resolveProjectImportPath } from './tsconfig-import-resolver.ts';

function buildPathPrefixFilter(prefix: string): RegExp {
	if (prefix.endsWith('/')) {
		return new RegExp(`^${escapeRegExp(prefix)}`);
	}

	return new RegExp(`^${escapeRegExp(prefix)}(?:/|$)`);
}

/**
 * @remarks
 * The `cacheKey` holds the tsconfig path prefixes only: a key that named `projectRoot` would change the
 * dependency key of every script that declares the plugin when the project moves.
 */
export function createAliasResolverPlugin(projectRoot: string): EcoBuildPlugin {
	const cache = new AliasResolverCache();
	const pathPrefixes = loadTsconfigPathPrefixes(projectRoot);

	return {
		name: 'ecopages-alias-resolver',
		cacheKey: JSON.stringify(pathPrefixes),
		setup(build) {
			if (pathPrefixes.length === 0) {
				return;
			}

			for (const prefix of pathPrefixes) {
				build.onResolve({ filter: buildPathPrefixFilter(prefix) }, (args) => {
					if (!args.importer) {
						return undefined;
					}

					const cached = cache.get(projectRoot, args.path);
					if (cached.hit) {
						return cached.resolved ? { path: cached.resolved } : undefined;
					}

					const resolved = resolveProjectImportPath(projectRoot, args.importer, args.path);
					cache.set(projectRoot, args.path, resolved);
					return resolved ? { path: resolved } : undefined;
				});
			}
		},
	};
}

export {
	isBarePackageImportSpecifier,
	matchesTsconfigPathPrefix,
	loadTsconfigPathPrefixes,
	resolveProjectImportPath,
	resolveProjectModulePath,
} from './tsconfig-import-resolver.ts';
