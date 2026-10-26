import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { isEcoDeclaredComponent } from '../../eco/eco-declared-component.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcoComponent, ErrorPageLoaders, StaticRoute, ViewLoader } from '../../types/contracts.ts';

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

async function collectLayoutFiles(appConfig: EcoPagesAppConfig, entries: Set<string>): Promise<void> {
	const layoutsDir = appConfig.absolutePaths.layoutsDir;
	if (!layoutsDir || !fileSystem.exists(layoutsDir)) {
		return;
	}

	const files = await fileSystem.glob(
		appConfig.templatesExt.map((extension) => `**/*${extension}`),
		{ cwd: layoutsDir },
	);
	for (const file of files) {
		entries.add(path.resolve(layoutsDir, file));
	}
}

/**
 * Collects every production server entry except `ssr: true` scripts, which are
 * discovered from compiled modules after the first graph emit.
 *
 * @remarks
 * Processor `listProductionServerModuleEntries()` files, such as generated content
 * collection modules, join the same map so production start can import them without
 * calling Processor `setup()`.
 */
export async function collectServerModuleEntries(options: {
	appConfig: EcoPagesAppConfig;
	router: ServerModuleEntryRouteSource;
	staticRoutes?: readonly StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
}): Promise<string[]> {
	const entries = new Set<string>();
	const { appConfig } = options;

	for (const route of options.router.templateRoutes) {
		addExistingPath(entries, route.filePath);
	}

	addExistingPath(entries, appConfig.absolutePaths.htmlTemplatePath);
	await collectLayoutFiles(appConfig, entries);

	for (const route of options.staticRoutes ?? []) {
		addViewLoader(entries, route.loader);
	}

	for (const loader of Object.values(options.errorPageLoaders ?? {})) {
		addViewLoader(entries, loader);
	}

	for (const processor of appConfig.processors.values()) {
		for (const entryPath of processor.listProductionServerModuleEntries?.() ?? []) {
			addExistingPath(entries, entryPath);
		}
	}

	return [...entries];
}

function addSsrScripts(component: EcoComponent, scripts: Set<string>): void {
	const identity = getComponentIdentity(component);
	const ownerDir = identity?.file ? path.dirname(identity.file) : undefined;
	if (!ownerDir) {
		return;
	}
	for (const script of component.config?.dependencies?.scripts ?? []) {
		if (typeof script === 'object' && script.ssr && script.src) {
			scripts.add(path.resolve(ownerDir, script.src));
		}
	}
}

function collectSsrScriptsFromComponent(component: unknown, seen: Set<unknown>, scripts: Set<string>): void {
	if (!component || seen.has(component) || !isEcoDeclaredComponent(component)) {
		return;
	}
	seen.add(component);
	const ecoComponent = component as EcoComponent;
	addSsrScripts(ecoComponent, scripts);
	for (const related of ecoComponent.config?.layouts ?? []) {
		collectSsrScriptsFromComponent(related, seen, scripts);
	}
	for (const related of ecoComponent.config?.dependencies?.components ?? []) {
		collectSsrScriptsFromComponent(related, seen, scripts);
	}
}

/**
 * Walks compiled Page, Layout, and view modules for `ssr: true` script paths.
 */
export function collectSsrScriptPaths(modules: readonly unknown[]): string[] {
	const scripts = new Set<string>();
	const seen = new Set<unknown>();
	for (const module of modules) {
		if (!module || typeof module !== 'object') {
			continue;
		}
		collectSsrScriptsFromComponent((module as { default?: unknown }).default, seen, scripts);
	}
	return [...scripts];
}
