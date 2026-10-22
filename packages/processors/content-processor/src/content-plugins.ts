import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/processor';
import {
	CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN,
	CONTENT_SERVER_VIRTUAL_MODULE_PATTERN,
	CONTENT_VIRTUAL_MODULE_PATTERN,
	parseCollectionSpecifier,
	type ParsedCollectionSpecifier,
} from './constants.ts';

export type { ParsedCollectionSpecifier };
export { parseCollectionSpecifier } from './constants.ts';

export type EnsureCollectionServerArtifact = (collectionName: string) => Promise<void>;

/** Resolves once the generated collection modules exist. */
export type EnsureCollectionsGenerated = () => Promise<void>;

export function parseCollectionName(specifier: string): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	return parsed?.collectionName ?? null;
}

/**
 * Resolves a collection specifier to its generated module path.
 *
 * @remarks
 * `/component` is the one variant that depends on the graph: the server graph backs it with the
 * server modules, and the Page Browser Graph backs it with the browser modules.
 */
export function resolveCollectionPath(
	specifier: string,
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	collectionBrowserModules: Record<string, string> = {},
	graph: 'server' | 'browser' = 'server',
): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	if (!parsed) {
		return null;
	}

	if (parsed.variant === 'component' && graph === 'browser') {
		return collectionBrowserModules[parsed.collectionName] ?? null;
	}

	if (parsed.variant === 'server' || parsed.variant === 'component') {
		return (
			collectionServerCompiledModules?.[parsed.collectionName] ??
			collectionServerModules[parsed.collectionName] ??
			null
		);
	}

	return collectionModules[parsed.collectionName] ?? null;
}

function createContentResolvePlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules: Record<string, string> | undefined,
	collectionBrowserModules: Record<string, string>,
	ensureCollectionServerArtifact: EnsureCollectionServerArtifact | undefined,
	ensureCollectionsGenerated: EnsureCollectionsGenerated | undefined,
	options: { graph: 'server' | 'browser'; namespace?: string; externalizeCompiledServerModules?: boolean },
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
					options.graph,
				);

			const resolveGeneratedModule = async (args: { path: string }) => {
				await ensureCollectionsGenerated?.();
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
			};

			build.onResolve({ filter: CONTENT_VIRTUAL_MODULE_PATTERN }, resolveGeneratedModule);

			if (options.graph === 'server') {
				const resolveServerBackedModule = async (args: { path: string }) => {
					await ensureCollectionsGenerated?.();
					const parsed = parseCollectionSpecifier(args.path);
					if (parsed) {
						await ensureCollectionServerArtifact?.(parsed.collectionName);
					}

					const compiledPath = parsed ? collectionServerCompiledModules?.[parsed.collectionName] : undefined;
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
				};

				build.onResolve({ filter: CONTENT_SERVER_VIRTUAL_MODULE_PATTERN }, resolveServerBackedModule);
				build.onResolve({ filter: CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN }, resolveServerBackedModule);
			} else {
				build.onResolve({ filter: CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN }, resolveGeneratedModule);
			}
		},
	};
}

/**
 * Creates the server graph resolver for collection virtual modules.
 *
 * @remarks
 * Compiled `/server` and `/component` modules are externalized so Node can load the collection
 * artifact directly; both specifiers share one module instance and one component cache. Every
 * resolve waits for `ensureCollectionsGenerated`, so a build that runs before the Processor's
 * `setup()` still finds the generated modules. The Page Browser Graph uses
 * `createContentPluginBundler`, where the content boundary rejects `/server` and `/component`
 * resolves to the browser-safe loader.
 */
export function createContentPlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	ensureCollectionServerArtifact?: EnsureCollectionServerArtifact,
	ensureCollectionsGenerated?: EnsureCollectionsGenerated,
): EcoBuildPlugin {
	return createContentResolvePlugin(
		collectionModules,
		collectionServerModules,
		collectionServerCompiledModules,
		{},
		ensureCollectionServerArtifact,
		ensureCollectionsGenerated,
		{ graph: 'server', externalizeCompiledServerModules: true },
	);
}

/**
 * Creates the Page Browser Graph resolver for collection virtual modules.
 *
 * @remarks
 * It resolves entries and `/component` modules to generated files on disk so
 * relative MDX imports inside those files resolve as filesystem paths. A
 * virtual namespace would keep those imports inside `ecopages-content:` and
 * Rolldown would report them as missing. `/server` resolution is omitted so
 * the content server-boundary plugin can reject any server artifact that
 * remains browser-reachable.
 */
export function createContentPluginBundler(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	collectionServerCompiledModules?: Record<string, string>,
	collectionBrowserModules: Record<string, string> = {},
	ensureCollectionsGenerated?: EnsureCollectionsGenerated,
): EcoBuildPlugin {
	return createContentResolvePlugin(
		collectionModules,
		collectionServerModules,
		collectionServerCompiledModules,
		collectionBrowserModules,
		undefined,
		ensureCollectionsGenerated,
		{ graph: 'browser' },
	);
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
