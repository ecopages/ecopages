import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createForeignJsxOverridePlugin } from '../../plugins/foreign-jsx-override-plugin.ts';
import { DevelopmentInvalidationService } from '../invalidation/development-invalidation.service.ts';
import { type AppModuleLoader, type AppModuleLoaderOwner } from './app-module-loader.service.ts';
import { createAppNodeBootstrapPlugin } from './node-bootstrap-plugin.ts';
import { PageModuleImportService, type PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { SourceModuleLoader } from './module-loading-types.ts';
import { supportsSourceModuleLoading } from './source-module-support.ts';
import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

export function shouldAppUseHostModuleLoader(appConfig: EcoPagesAppConfig, filePath: string): boolean {
	if (appConfig.runtime?.hostModuleLoader) {
		return supportsSourceModuleLoading(filePath);
	}

	const normalizedFilePath = path.normalize(filePath);
	const frameworkOwnedDirectories = [
		appConfig.absolutePaths.pagesDir,
		appConfig.absolutePaths.includesDir,
		appConfig.absolutePaths.layoutsDir,
		appConfig.absolutePaths.componentsDir,
	].map((directoryPath) => path.normalize(directoryPath));
	const isFrameworkOwnedModule = frameworkOwnedDirectories.some((directoryPath) => {
		return normalizedFilePath === directoryPath || normalizedFilePath.startsWith(`${directoryPath}${path.sep}`);
	});
	const isConfiguredTemplateModule = appConfig.templatesExt.some((extension) =>
		normalizedFilePath.endsWith(extension),
	);

	return !(isFrameworkOwnedModule && isConfiguredTemplateModule);
}

export function getAppHostModuleLoader(appConfig: EcoPagesAppConfig): SourceModuleLoader | undefined {
	return appConfig.runtime?.hostModuleLoader;
}

function getAppModuleLoaderOwner(appConfig: EcoPagesAppConfig): AppModuleLoaderOwner {
	return getAppHostModuleLoader(appConfig) ? 'host' : 'bun';
}

export function setAppHostModuleLoader(appConfig: EcoPagesAppConfig, hostModuleLoader?: SourceModuleLoader): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		hostModuleLoader,
	};
}

function getOwningIntegration(appConfig: EcoPagesAppConfig, filePath: string) {
	return appConfig.integrations
		?.flatMap((integration) =>
			integration.extensions
				.filter((extension) => filePath.endsWith(extension))
				.map((extension) => ({ integration, extension })),
		)
		.sort((left, right) => right.extension.length - left.extension.length)[0]?.integration;
}

function getBunOwnedJsxPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const jsxExtensions = (appConfig.integrations ?? [])
		.filter((integration) => integration.jsxImportSource)
		.flatMap((integration) =>
			integration.extensions
				.filter((extension) => extension.endsWith('.tsx') || extension.endsWith('.jsx'))
				.map((extension) => ({ integration, extension })),
		)
		.sort((left, right) => right.extension.length - left.extension.length);

	return jsxExtensions.map(({ integration, extension }) =>
		createForeignJsxOverridePlugin({
			hostJsxImportSource: integration.jsxImportSource!,
			foreignExtensions: [extension],
			excludeExtensions: jsxExtensions
				.filter((candidate) => candidate.extension.length > extension.length)
				.filter((candidate) => candidate.extension.endsWith(extension))
				.map((candidate) => candidate.extension),
			name: `ecopages-bun-jsx-ownership-${integration.name}-${extension.replace(/[^a-zA-Z0-9]+/g, '-')}`,
		}),
	);
}

export function createAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const invalidationService = new DevelopmentInvalidationService(appConfig);
	const pageModuleImportService = new PageModuleImportService({
		canLoadSourceModuleFromHost: (filePath) => shouldAppUseHostModuleLoader(appConfig, filePath),
		getHostModuleLoader: () => getAppHostModuleLoader(appConfig),
	});
	const getDefaultPlugins =
		typeof Bun === 'undefined' && appConfig.rootDir ? () => [createAppNodeBootstrapPlugin(appConfig)] : () => [];
	const appLoaderPlugins = Array.from(appConfig.loaders?.values() ?? []);
	const bunOwnedJsxPlugins = typeof Bun !== 'undefined' ? getBunOwnedJsxPlugins(appConfig) : [];
	const appModuleLoader: AppModuleLoader & {
		pageModuleImportService: PageModuleImportService;
	} = {
		get owner(): AppModuleLoaderOwner {
			return getAppModuleLoaderOwner(appConfig);
		},
		pageModuleImportService,
		async importModule<T = unknown>(options: PageModuleBuildImportOptions) {
			const invalidationVersion =
				options.invalidationVersion ?? invalidationService.getServerModuleInvalidationVersion();
			const owningIntegration = getOwningIntegration(appConfig, options.filePath);
			const owningJsxImportSource = owningIntegration?.jsxImportSource;
			const mergedPlugins = [
				...getDefaultPlugins(),
				...appLoaderPlugins,
				...bunOwnedJsxPlugins,
				...(options.plugins ?? []),
			];

			return await pageModuleImportService.importModule<T>({
				...options,
				...(mergedPlugins.length > 0 ? { plugins: mergedPlugins } : {}),
				...(typeof Bun !== 'undefined' && owningJsxImportSource
					? {
							jsx: {
								development: process.env.NODE_ENV === 'development',
								importSource: owningJsxImportSource,
								runtime: 'automatic',
							},
						}
					: {}),
				buildExecutor: options.buildExecutor ?? getAppBuildExecutor(appConfig),
				invalidationVersion,
			});
		},
		invalidateDevelopmentGraph() {
			pageModuleImportService.invalidateDevelopmentGraph();
		},
	};

	return appModuleLoader;
}

export function getAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const existingModuleLoader = appConfig.runtime?.appModuleLoader;
	if (existingModuleLoader) {
		return existingModuleLoader;
	}

	const appModuleLoader = createAppModuleLoader(appConfig);
	setAppModuleLoader(appConfig, appModuleLoader);
	return appModuleLoader;
}

export function setAppModuleLoader(appConfig: EcoPagesAppConfig, appModuleLoader: AppModuleLoader): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		appModuleLoader,
	};
}

/**
 * Creates the shared app-scoped server-module transpiler for one runtime
 * instance.
 */
export function createAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	const invalidationService = new DevelopmentInvalidationService(appConfig);

	return new ServerModuleTranspiler({
		rootDir: appConfig.rootDir,
		invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		pageModuleImportService: getAppModuleLoader(appConfig),
	});
}

/**
 * Returns the app-owned server-module transpiler, creating it lazily when the
 * runtime first needs one.
 */
export function getAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	const existingTranspiler = appConfig.runtime?.serverModuleTranspiler;
	if (existingTranspiler) {
		return existingTranspiler;
	}

	const serverModuleTranspiler = createAppServerModuleTranspiler(appConfig);
	setAppServerModuleTranspiler(appConfig, serverModuleTranspiler);
	return serverModuleTranspiler;
}

/**
 * Installs the server-module transpiler that should serve one app instance.
 */
export function setAppServerModuleTranspiler(
	appConfig: EcoPagesAppConfig,
	serverModuleTranspiler: ServerModuleTranspiler,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		serverModuleTranspiler,
	};
}
