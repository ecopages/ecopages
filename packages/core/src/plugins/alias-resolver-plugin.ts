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
 * A query on the specifier, such as a module variant, follows the resolved path.
 *
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

					const queryStart = args.path.indexOf('?');
					const specifier = queryStart === -1 ? args.path : args.path.slice(0, queryStart);
					const query = queryStart === -1 ? '' : args.path.slice(queryStart);
					const cached = cache.get(projectRoot, specifier);
					if (cached.hit) {
						return cached.resolved ? { path: `${cached.resolved}${query}` } : undefined;
					}

					const resolved = resolveProjectImportPath(projectRoot, args.importer, specifier);
					cache.set(projectRoot, specifier, resolved);
					return resolved ? { path: `${resolved}${query}` } : undefined;
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
