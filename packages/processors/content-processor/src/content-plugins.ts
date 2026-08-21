import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import {
	CONTENT_BROWSER_VIRTUAL_MODULE_PATTERN,
	CONTENT_SERVER_VIRTUAL_MODULE_PATTERN,
	CONTENT_VIRTUAL_MODULE_PATTERN,
	parseCollectionSpecifier,
	type ParsedCollectionSpecifier,
} from './constants.ts';

export type { ParsedCollectionSpecifier };
export { parseCollectionSpecifier } from './constants.ts';

export type EnsureCollectionServerArtifact = (collectionName: string) => Promise<void>;

export function parseCollectionName(specifier: string): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	return parsed?.collectionName ?? null;
}

export function resolveCollectionPath(
	specifier: string,
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	collectionBrowserModules: Record<string, string> = {},
): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	if (!parsed) {
		return null;
	}

	if (parsed.variant === 'server') {
		return (
			collectionServerCompiledModules?.[parsed.collectionName] ??
			collectionServerModules[parsed.collectionName] ??
			null
		);
	}

	if (parsed.variant === 'browser') {
		return collectionBrowserModules[parsed.collectionName] ?? null;
	}

	return collectionModules[parsed.collectionName] ?? null;
}

function createContentResolvePlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules: Record<string, string> | undefined,
	collectionBrowserModules: Record<string, string>,
	ensureCollectionServerArtifact: EnsureCollectionServerArtifact | undefined,
	options: { namespace?: string; includeServerModules?: boolean; externalizeCompiledServerModules?: boolean },
): EcoBuildPlugin {
	return {
		name: 'ecopages:content',
		setup(build) {
			const resolveCollection = (specifier: string) =>
				resolveCollectionPath(
					specifier,
					collectionModules,
					collectionServerModules,
					collectionServerCompiledModules,
					collectionBrowserModules,
				);

			build.onResolve({ filter: CONTENT_VIRTUAL_MODULE_PATTERN }, (args) => {
				const modulePath = resolveCollection(args.path);
				if (!modulePath) {
					return undefined;
				}

				if (options.namespace) {
					return {
						namespace: options.namespace,
						path: modulePath,
					};
				}

				return { path: modulePath };
			});

			if (options.includeServerModules !== false) {
				build.onResolve({ filter: CONTENT_SERVER_VIRTUAL_MODULE_PATTERN }, async (args) => {
					const parsed = parseCollectionSpecifier(args.path);
					if (parsed?.variant === 'server' && !collectionServerCompiledModules?.[parsed.collectionName]) {
						await ensureCollectionServerArtifact?.(parsed.collectionName);
					}

					const compiledPath =
						parsed?.variant === 'server'
							? collectionServerCompiledModules?.[parsed.collectionName]
							: undefined;
					if (compiledPath && options.externalizeCompiledServerModules) {
						return { path: compiledPath, external: true };
					}

					const modulePath = resolveCollection(args.path);
					if (!modulePath) {
						return undefined;
					}

					if (options.namespace) {
						return {
							namespace: options.namespace,
							path: modulePath,
						};
					}

					return { path: modulePath };
				});
			}

			build.onResolve({ filter: CONTENT_BROWSER_VIRTUAL_MODULE_PATTERN }, (args) => {
				const modulePath = resolveCollection(args.path);
				if (!modulePath) {
					return undefined;
				}

				if (options.namespace) {
					return { namespace: options.namespace, path: modulePath };
				}

				return { path: modulePath };
			});
		},
	};
}

/**
 * Creates the server graph resolver for collection virtual modules.
 *
 * @remarks
 * Compiled `/server` modules are externalized so Node can load the collection
 * artifact directly. The Page Browser Graph uses `createContentPluginBundler`,
 * where the content boundary rejects `/server` and resolves `/browser` to
 * browser-safe source.
 */
export function createContentPlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	collectionBrowserModules: Record<string, string> = {},
	ensureCollectionServerArtifact?: EnsureCollectionServerArtifact,
): EcoBuildPlugin {
	return createContentResolvePlugin(
		collectionModules,
		collectionServerModules,
		collectionServerCompiledModules,
		collectionBrowserModules,
		ensureCollectionServerArtifact,
		{ includeServerModules: true, externalizeCompiledServerModules: true },
	);
}

/**
 * Creates the Page Browser Graph resolver for collection virtual modules.
 *
 * @remarks
 * It resolves entries and `/browser` modules into browser source. `/server`
 * resolution is deliberately omitted so the content server-boundary plugin can
 * reject any server artifact that remains browser-reachable.
 */
export function createContentPluginBundler(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	collectionBrowserModules: Record<string, string> = {},
): EcoBuildPlugin {
	const plugin = createContentResolvePlugin(
		collectionModules,
		collectionServerModules,
		collectionServerCompiledModules,
		collectionBrowserModules,
		undefined,
		{
			namespace: 'ecopages-content',
			includeServerModules: false,
		},
	);

	return {
		name: plugin.name,
		setup(build) {
			plugin.setup?.(build);

			build.onLoad({ filter: /.*/, namespace: 'ecopages-content' }, async (args) => {
				const contents = await fileSystem.readFile(args.path);
				return { contents, loader: 'ts' };
			});
		},
	};
}

export function getCollectionCachePath(cacheDir: string, collectionName: string): string {
	return path.join(cacheDir, `${collectionName}.ts`);
}

export function getCollectionServerCachePath(cacheDir: string, collectionName: string): string {
	return path.join(cacheDir, `${collectionName}.server.ts`);
}

/** Returns the generated browser module path for one collection. */
export function getCollectionBrowserCachePath(cacheDir: string, collectionName: string): string {
	return path.join(cacheDir, `${collectionName}.browser.ts`);
}
