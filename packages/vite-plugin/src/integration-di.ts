import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import path from 'node:path';

/**
 * Virtual module id that exposes the integration manifest to the runtime.
 */
export const ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID = 'virtual:ecopages/integration-manifest.ts';

/**
 * Virtual module id that exposes the discovered island registry.
 */
export const ECOPAGES_ISLAND_REGISTRY_MODULE_ID = 'virtual:ecopages/island-registry.ts';

/**
 * Virtual module id that exposes the island client runtime entrypoint.
 */
export const ECOPAGES_ISLAND_CLIENT_MODULE_ID = 'virtual:ecopages/island-client.ts';

/**
 * Serializable integration manifest entry consumed by the runtime.
 */
export interface EcopagesIntegrationManifestEntry {
	name: string;
	extensions: string[];
}

/**
 * Runtime shape of the generated integration manifest module.
 */
export interface EcopagesIntegrationManifestModule {
	integrations: EcopagesIntegrationManifestEntry[];
}

/**
 * Runtime shape of the generated island registry module.
 */
export interface EcopagesIslandRegistryModule {
	islands: Record<string, string>;
}

/**
 * Resolved module ids and directory paths forwarded into the Ecopages runtime.
 */
export interface EcopagesRendererModuleContext {
	appConfig: EcoPagesAppConfig;
	integrationManifestModuleId: typeof ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID;
	islandClientModuleId: typeof ECOPAGES_ISLAND_CLIENT_MODULE_ID;
	islandRegistryModuleId: typeof ECOPAGES_ISLAND_REGISTRY_MODULE_ID;
	htmlTemplateModulePath: string;
	pagesDirectoryPath: string;
	layoutsDirectoryPath: string;
}

/**
 * Creates the source for the generated integration manifest virtual module.
 */
export function createIntegrationManifestModuleSource(appConfig: EcoPagesAppConfig): string {
	const integrations = appConfig.integrations.map((integration) => ({
		name: integration.name,
		extensions: [...integration.extensions],
	}));

	return `export const integrations = ${JSON.stringify(integrations, null, 2)};\n`;
}

/**
 * Creates an empty island registry module source used as the default fallback.
 */
export function createIslandRegistryModuleSource(): string {
	return 'export const islands = {};\n';
}

function toProjectRelativeGlob(rootDir: string, targetDirectoryPath: string, extension: string): string {
	const relativeDirectory = path.relative(rootDir, targetDirectoryPath).split(path.sep).join('/');
	return `/${relativeDirectory}/**/*${extension}`;
}

/**
 * Builds the glob patterns used to discover island-capable component modules.
 */
export function createIslandRegistryGlobPatterns(appConfig: EcoPagesAppConfig): string[] {
	const rootDir = appConfig.rootDir;
	const componentsDir = appConfig.absolutePaths.componentsDir;
	const patterns = appConfig.integrations
		.flatMap((integration) => integration.extensions)
		.filter(
			(extension) =>
				extension.endsWith('.ts') ||
				extension.endsWith('.tsx') ||
				extension.endsWith('.js') ||
				extension.endsWith('.jsx'),
		)
		.map((extension) => toProjectRelativeGlob(rootDir, componentsDir, extension));

	return Array.from(new Set(patterns)).sort();
}

/**
 * Creates the source for the generated island registry virtual module.
 */
export function createIslandRegistryModuleSourceFromConfig(appConfig: EcoPagesAppConfig): string {
	const globPatterns = createIslandRegistryGlobPatterns(appConfig);
	const globExpression = globPatterns.length
		? `Object.assign({}, ${globPatterns.map((pattern) => `import.meta.glob(${JSON.stringify(pattern)})`).join(', ')})`
		: '{}';

	return `export const islands = ${globExpression};\nexport const islandPatterns = ${JSON.stringify(globPatterns, null, 2)};\n`;
}

/**
 * Creates the renderer module context injected into the Ecopages runtime.
 */
export function createRendererModuleContext(appConfig: EcoPagesAppConfig): EcopagesRendererModuleContext {
	return {
		appConfig,
		htmlTemplateModulePath: appConfig.absolutePaths.htmlTemplatePath,
		integrationManifestModuleId: ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID,
		islandClientModuleId: ECOPAGES_ISLAND_CLIENT_MODULE_ID,
		islandRegistryModuleId: ECOPAGES_ISLAND_REGISTRY_MODULE_ID,
		layoutsDirectoryPath: appConfig.absolutePaths.layoutsDir,
		pagesDirectoryPath: appConfig.absolutePaths.pagesDir,
	};
}
