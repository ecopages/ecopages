/**
 * Page module loading and configuration resolution service for React integration.
 *
 * Handles component config metadata resolution and module hydration analysis.
 * MDX page modules load through the core {@link PageModuleImportService} path
 * using the React plugin's server build contributions.
 *
 * @module
 */

import path from 'node:path';
import type { EcoComponentConfig, EcoPageFile } from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import { fileSystem } from '@ecopages/file-system';
import { someInConfigTree } from '../utils/component-config-traversal.ts';
import { collectDeclaredModulesInConfig } from '../utils/declared-modules.ts';

/**
 * Configuration for the ReactPageModuleService.
 */
export interface ReactPageModuleServiceConfig {
	rootDir: string;
	distDir: string;
	workDir: string;
	layoutsDir?: string;
	componentsDir?: string;
	mdxExtensions: string[];
	integrationName: string;
	hasRouterAdapter: boolean;
}

/**
 * Manages page module metadata resolution and hydration analysis for React pages.
 */
export class ReactPageModuleService {
	private readonly config: ReactPageModuleServiceConfig;

	constructor(config: ReactPageModuleServiceConfig) {
		this.config = config;
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 */
	isMdxFile(filePath: string): boolean {
		return this.config.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	/**
	 * Ensures that an EcoComponentConfig has proper `__eco` metadata attached.
	 */
	ensureConfigFileMetadata(config: EcoComponentConfig, pagePath: string): EcoComponentConfig {
		if (config.__eco?.file) {
			return config;
		}

		const buildEcoMeta = (file: string) => ({
			id: config.__eco?.id ?? rapidhash(file).toString(36),
			integration: config.__eco?.integration ?? this.config.integrationName,
			file,
		});

		const resolveDependencyValue = (value: string | { src?: string }) =>
			typeof value === 'string' ? value : value.src;

		const dependencyPaths = [
			...(config.dependencies?.stylesheets ?? []).map(resolveDependencyValue),
			...(config.dependencies?.scripts ?? []).map(resolveDependencyValue),
		]
			.filter((value): value is string => Boolean(value))
			.filter((value) => value.startsWith('./') || value.startsWith('../'));

		const candidateDirs = [this.config.layoutsDir, this.config.componentsDir, path.dirname(pagePath)].filter(
			(value): value is string => typeof value === 'string' && value.length > 0,
		);

		for (const dependencyPath of dependencyPaths) {
			for (const candidateDir of candidateDirs) {
				const resolvedDependency = path.resolve(candidateDir, dependencyPath);
				if (fileSystem.exists(resolvedDependency)) {
					return {
						...config,
						__eco: buildEcoMeta(path.join(candidateDir, path.basename(pagePath))),
					};
				}
			}
		}

		return {
			...config,
			__eco: buildEcoMeta(pagePath),
		};
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
		const declarations = [
			...collectDeclaredModulesInConfig(pageModule.default?.config),
			...collectDeclaredModulesInConfig(pageModule.config),
		];

		return Array.from(new Set(declarations));
	}
}
