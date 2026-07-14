import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import { CONTENT_VIRTUAL_MODULE_PATTERN } from './constants.ts';

function parseCollectionName(specifier: string): string | null {
	if (specifier.startsWith('ecopages:content/')) {
		return specifier.slice('ecopages:content/'.length);
	}

	if (specifier.startsWith('content/')) {
		return specifier.slice('content/'.length);
	}

	return null;
}

function resolveCollectionPath(specifier: string, collectionModules: Record<string, string>): string | null {
	const collectionName = parseCollectionName(specifier);
	if (!collectionName) {
		return null;
	}

	return collectionModules[collectionName] ?? null;
}

export function createContentPlugin(collectionModules: Record<string, string>): EcoBuildPlugin {
	return {
		name: 'ecopages:content',
		setup(build) {
			build.onResolve({ filter: CONTENT_VIRTUAL_MODULE_PATTERN }, (args) => {
				const modulePath = resolveCollectionPath(args.path, collectionModules);
				if (!modulePath) {
					return undefined;
				}

				return { path: modulePath };
			});
		},
	};
}

export function createContentPluginBundler(collectionModules: Record<string, string>): EcoBuildPlugin {
	return {
		name: 'ecopages:content',
		setup(build) {
			build.onResolve({ filter: CONTENT_VIRTUAL_MODULE_PATTERN }, (args) => {
				const modulePath = resolveCollectionPath(args.path, collectionModules);
				if (!modulePath) {
					return undefined;
				}

				return {
					namespace: 'ecopages-content',
					path: modulePath,
				};
			});

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

export { parseCollectionName, resolveCollectionPath };
