/**
 * Page module loading and configuration resolution service for React integration.
 *
 * Handles component identity resolution and module hydration analysis.
 * MDX page modules load through the core {@link PageModuleImportService} path
 * using the React plugin's server build contributions.
 *
 * @module
 */

import {
	bindComponentIdentity,
	getComponentIdentity,
	getComponentOwner,
	type EcoComponentConfig,
	type EcoPageFile,
} from '@ecopages/core';
import { contentHash } from '@ecopages/core/build';
import { someInConfigTree } from '../client-graph/component-config-traversal.ts';
import { collectPageDeclaredModulesFromModule } from '../client-graph/declared-modules.ts';

/**
 * Configuration for the PageModuleService.
 */
export interface PageModuleServiceConfig {
	mdxExtensions: string[];
	integrationName: string;
	hasRouterAdapter: boolean;
}

/**
 * Manages page module metadata resolution and hydration analysis for React pages.
 */
export class PageModuleService {
	private readonly config: PageModuleServiceConfig;

	constructor(config: PageModuleServiceConfig) {
		this.config = config;
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 */
	isMdxFile(filePath: string): boolean {
		return this.config.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	/**
	 * Ensures that an EcoComponentConfig has canonical identity attached.
	 *
	 * @remarks
	 * A config the build stamped keeps its identity. One without it was not declared by a literal `eco.*` call, so
	 * it is bound to the page that reached it and its relative paths resolve against that page.
	 */
	ensureConfigFileMetadata(config: EcoComponentConfig, pagePath: string): EcoComponentConfig {
		const identity = getComponentIdentity(config);
		if (identity?.file) {
			return config;
		}

		return bindComponentIdentity(
			{
				id: identity?.id ?? BigInt(`0x${contentHash(pagePath, 16)}`).toString(36),
				integration: getComponentOwner(config, this.config.integrationName),
				file: pagePath,
			},
			config,
		);
	}

	hasModulesInConfig(config: EcoComponentConfig | undefined): boolean {
		return someInConfigTree(
			config,
			(node) => node.dependencies?.modules?.some((entry) => entry.trim().length > 0) ?? false,
		);
	}

	shouldHydratePage(
		pageModule: EcoPageFile<{ config?: EcoComponentConfig }> & { config?: EcoComponentConfig },
	): boolean {
		if (this.config.hasRouterAdapter) {
			return true;
		}

		const pageConfig = pageModule.default?.config;
		return this.hasModulesInConfig(pageConfig) || this.hasModulesInConfig(pageModule.config);
	}

	collectPageDeclaredModules(
		pageModule: EcoPageFile<{ config?: EcoComponentConfig }> & { config?: EcoComponentConfig },
	): string[] {
		return collectPageDeclaredModulesFromModule(pageModule);
	}
}
