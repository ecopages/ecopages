import path from 'node:path';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import {
	collectViewIntegrations,
	findViewOwner,
	isExemptFromViewReference,
	viewExtensionFilter,
	viewReferenceModuleSource,
} from './view-reference.ts';

export const IMPORTED_VIEW_PLUGIN_NAME = 'ecopages-imported-views';

const importedViewPaths = new WeakMap<EcoPagesAppConfig, Set<string>>();

/** Paths the server-entry plugin turned into view references for this app. */
export function getImportedViewPaths(appConfig: EcoPagesAppConfig): readonly string[] {
	return [...(importedViewPaths.get(appConfig) ?? [])];
}

function recordImportedViewPath(appConfig: EcoPagesAppConfig, filePath: string): void {
	const resolvedPath = path.resolve(filePath);
	const paths = importedViewPaths.get(appConfig);
	if (paths) {
		paths.add(resolvedPath);
		return;
	}
	importedViewPaths.set(appConfig, new Set([resolvedPath]));
}

/**
 * Turns Integration-owned imports in the server-entry graph into view references.
 *
 * @remarks
 * Register only on the server-entry bundle. Page and route-module builds must
 * still compile those files. Recorded paths join the production server-modules
 * map so `ctx.render` views are not compiled at request time.
 */
export function createImportedViewPlugin(
	appConfig: EcoPagesAppConfig,
	options: { entryPath?: string } = {},
): EcoBuildPlugin {
	const integrations = collectViewIntegrations(appConfig.integrations);
	const extensions = [...new Set(integrations.flatMap((integration) => [...integration.extensions]))];
	const entryPath = options.entryPath ? path.resolve(options.entryPath) : undefined;

	if (extensions.length === 0) {
		return {
			name: IMPORTED_VIEW_PLUGIN_NAME,
			environments: ['server'],
			setup() {},
		};
	}

	const filter = viewExtensionFilter(extensions);

	return {
		name: IMPORTED_VIEW_PLUGIN_NAME,
		environments: ['server'],
		cacheKey: JSON.stringify(extensions),
		setup(build) {
			build.onLoad({ filter }, (args) => {
				if (isExemptFromViewReference(args.path, { entryPath, appRoot: appConfig.rootDir })) {
					return undefined;
				}
				const owner = findViewOwner(integrations, args.path);
				if (!owner) {
					return undefined;
				}
				recordImportedViewPath(appConfig, args.path);
				return {
					contents: viewReferenceModuleSource(args.path, owner.name),
					loader: 'js',
				};
			});
		},
	};
}
