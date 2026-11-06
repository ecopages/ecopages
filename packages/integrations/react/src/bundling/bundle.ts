/**
 * Bundle configuration service for React integration.
 *
 * Encapsulates all build plugin creation and bundle options
 * for client-side React component builds.
 *
 * @module
 */

import { createClientGraphBoundaryPlugin, createForeignJsxScope } from '../client-graph/boundary-plugin.ts';
import { findJsxExtensionOwner, getHostScopedJsxOwnershipPlugins, isProductionRuntime } from '@ecopages/core/build';
import type { EcoBuildPlugin, IntegrationRuntimeContext } from '@ecopages/core/integration';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';

/**
 * Configuration for the BundleService.
 */
export interface BundleServiceConfig {
	rootDir: string;
	appConfig: IntegrationRuntimeContext['appConfig'];
	hostIntegrationName: string;
	routerAdapter?: ReactRouterAdapter;
	getMdxLoaderPlugin?: () => EcoBuildPlugin;
}

/**
 * Packages whose imports the client-graph boundary keeps whatever a module's declared `modules` say.
 *
 * @remarks
 * Hydration needs React, React DOM, core's browser entry and the configured router in every client graph.
 */
export function getReactClientGraphAllowSpecifiers(routerAdapter?: ReactRouterAdapter): string[] {
	return ['@ecopages/core', 'react', 'react-dom', ...(routerAdapter ? [routerAdapter.importPath] : [])];
}

/**
 * Manages bundle configuration and plugin creation for React page/component builds.
 */
export class BundleService {
	private readonly config: BundleServiceConfig;
	private readonly foreignJsxOverridePlugin: EcoBuildPlugin | undefined;
	private mdxLoaderPlugin: EcoBuildPlugin | null | undefined;

	constructor(config: BundleServiceConfig) {
		this.config = config;
		[this.foreignJsxOverridePlugin] = getHostScopedJsxOwnershipPlugins(
			config.appConfig,
			config.hostIntegrationName,
			{
				name: 'react-renderer-foreign-jsx-override',
				scope: createForeignJsxScope({
					projectRoot: config.appConfig?.absolutePaths?.projectDir ?? config.rootDir,
					hostIntegrationName: config.hostIntegrationName,
					findForeignOwner: (filePath) => {
						const owner = findJsxExtensionOwner(config.appConfig, filePath);
						return owner === config.hostIntegrationName ? undefined : owner;
					},
				}),
			},
		);
	}

	/**
	 * Creates bundle options for a page or component entry.
	 *
	 * @remarks
	 * React, React DOM and the router are ordinary packages of the build, so the bundler resolves and shares them
	 * like any other import.
	 *
	 * @param componentName - Generated unique component name for output naming
	 * @param declaredModules - Explicitly declared browser module specifiers
	 * @returns Bundle options object for the build adapter
	 */
	async createBundleOptions(
		componentName: string,
		declaredModules: string[],
		entrypointFile?: string,
		groupedEntrypointFiles?: readonly string[],
		groupedDeclaredModules?: readonly string[],
	): Promise<Record<string, unknown>> {
		return {
			mainFields: ['module', 'browser', 'main'],
			naming: `${componentName}.[ext]`,
			...(isProductionRuntime() && {
				minify: true,
				treeshaking: true,
			}),
			plugins: this.createClientBuildPlugins({
				declaredModules,
				entrypointFile,
				groupedEntrypointFiles,
				groupedDeclaredModules,
			}),
		};
	}

	private createClientBuildPlugins(options: {
		declaredModules: string[];
		entrypointFile?: string;
		groupedEntrypointFiles?: readonly string[];
		groupedDeclaredModules?: readonly string[];
	}): EcoBuildPlugin[] {
		const graphBoundaryPlugin = createClientGraphBoundaryPlugin({
			projectRoot: this.config.appConfig?.absolutePaths?.projectDir ?? this.config.rootDir,
			absWorkingDir: this.config.rootDir,
			entrypointFile: options.entrypointFile,
			groupedEntrypointFiles: options.groupedEntrypointFiles,
			groupedDeclaredModules: options.groupedDeclaredModules,
			declaredModules: options.declaredModules,
			alwaysAllowSpecifiers: getReactClientGraphAllowSpecifiers(this.config.routerAdapter),
		});

		const mdxPlugin = this.getMdxLoaderPlugin();
		return [
			...(this.foreignJsxOverridePlugin ? [this.foreignJsxOverridePlugin] : []),
			graphBoundaryPlugin,
			...(mdxPlugin ? [mdxPlugin] : []),
		];
	}

	private getMdxLoaderPlugin(): EcoBuildPlugin | undefined {
		if (this.mdxLoaderPlugin === undefined) {
			this.mdxLoaderPlugin = this.config.getMdxLoaderPlugin?.() ?? null;
		}
		return this.mdxLoaderPlugin ?? undefined;
	}
}
