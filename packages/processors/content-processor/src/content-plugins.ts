import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import { CONTENT_SERVER_VIRTUAL_MODULE_PATTERN, CONTENT_VIRTUAL_MODULE_PATTERN } from './constants.ts';

export type ParsedCollectionSpecifier = {
	collectionName: string;
	variant: 'entries' | 'server';
};

export function parseCollectionName(specifier: string): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	return parsed?.collectionName ?? null;
}

export function parseCollectionSpecifier(specifier: string): ParsedCollectionSpecifier | null {
	const normalized = specifier.startsWith('ecopages:content/')
		? specifier.slice('ecopages:content/'.length)
		: specifier.startsWith('content/')
			? specifier.slice('content/'.length)
			: null;

	if (!normalized) {
		return null;
	}

	if (normalized.endsWith('/server')) {
		return {
			collectionName: normalized.slice(0, -'/server'.length),
			variant: 'server',
		};
	}

	return {
		collectionName: normalized,
		variant: 'entries',
	};
}

export function resolveCollectionPath(
	specifier: string,
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
): string | null {
	const parsed = parseCollectionSpecifier(specifier);
	if (!parsed) {
		return null;
	}

	if (parsed.variant === 'server') {
		return collectionServerModules[parsed.collectionName] ?? null;
	}

	return collectionModules[parsed.collectionName] ?? null;
}

function createContentResolvePlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
	options: { namespace?: string; includeServerModules?: boolean },
): EcoBuildPlugin {
	return {
		name: 'ecopages:content',
		setup(build) {
			const resolveCollection = (specifier: string) =>
				resolveCollectionPath(specifier, collectionModules, collectionServerModules);

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
				build.onResolve({ filter: CONTENT_SERVER_VIRTUAL_MODULE_PATTERN }, (args) => {
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
		},
	};
}

export function createContentPlugin(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
): EcoBuildPlugin {
	return createContentResolvePlugin(collectionModules, collectionServerModules, {
		includeServerModules: true,
	});
}

export function createContentPluginBundler(
	collectionModules: Record<string, string>,
	collectionServerModules: Record<string, string>,
): EcoBuildPlugin {
	const plugin = createContentResolvePlugin(collectionModules, collectionServerModules, {
		namespace: 'ecopages-content',
		includeServerModules: false,
	});

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
