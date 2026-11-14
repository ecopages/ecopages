import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { ErrorPageLoaders, StaticRoute, ViewLoader } from '../../types/contracts.ts';
import { getImportedViewPaths } from '../server/imported-view-plugin.ts';

export type ServerModuleEntryRouteSource = {
	templateRoutes: readonly { filePath: string }[];
};

/**
 * True when the file is bundled through Rolldown rather than `compilePageModule`.
 *
 * @remarks
 * Endpoints and `ssr: true` scripts have no Integration owner and still go through
 * Rolldown. HTML Pages and `html.html` compile in process.
 */
export function isRolldownServerModuleEntry(filePath: string, appConfig: EcoPagesAppConfig): boolean {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	return !owner?.compilePageModule;
}

function addExistingPath(entries: Set<string>, filePath: string | undefined): void {
	if (filePath && fileSystem.exists(filePath)) {
		entries.add(path.resolve(filePath));
	}
}

function addViewLoader(entries: Set<string>, loader: ViewLoader | undefined): void {
	addExistingPath(entries, loader?.filePath);
}

/**
 * Collects every production server entry except `ssr: true` scripts, which the server build
 * adds from each declaration (`createSsrScriptEntriesPlugin`).
 *
 * @remarks
 * Processor `listProductionServerModuleEntries()` files, such as generated content
 * collection modules, join the same map so production start can import them without
 * calling Processor `setup()`. A Layout is not an entry: the Page that passes it as `eco.page({ layout })` uses
 * it, so it is bundled once with that Page and keeps its exports. Views imported into the server entry (`ctx.render`, `ctx.renderPartial`) are recorded by the imported-view plugin during that bundle.
 */
export function collectServerModuleEntries(options: {
	appConfig: EcoPagesAppConfig;
	router: ServerModuleEntryRouteSource;
	staticRoutes?: readonly StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
}): string[] {
	const entries = new Set<string>();
	const { appConfig } = options;

	for (const route of options.router.templateRoutes) {
		addExistingPath(entries, route.filePath);
	}

	addExistingPath(entries, appConfig.absolutePaths.htmlTemplatePath);

	for (const route of options.staticRoutes ?? []) {
		addViewLoader(entries, route.loader);
	}

	for (const loader of Object.values(options.errorPageLoaders ?? {})) {
		addViewLoader(entries, loader);
	}

	for (const filePath of getImportedViewPaths(appConfig)) {
		addExistingPath(entries, filePath);
	}

	for (const processor of appConfig.processors.values()) {
		for (const entryPath of processor.listProductionServerModuleEntries?.() ?? []) {
			addExistingPath(entries, entryPath);
		}
	}

	return [...entries];
}
