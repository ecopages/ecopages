import path from 'node:path';
import type { DependencyAttributes, EcoComponent, EcoComponentConfig } from '@ecopages/core';
import { attachEcoFileMetadataToConfig } from '@ecopages/core/route-renderer/page-loading/file-scoped-dependency-components';
import {
	AssetFactory,
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import { collectFromConfigForest, getComponentConfigs } from '../client-graph/component-config-traversal.ts';
import type { PageModuleService } from '../page/page-module.ts';

type MdxConfigDependencyProcessor = (components: Partial<EcoComponent>[]) => Promise<ProcessedAsset[]>;

export interface MdxConfigDependencyServiceConfig {
	integrationName: string;
	pageModuleService: Pick<PageModuleService, 'ensureConfigFileMetadata'>;
	assetProcessingService?: Pick<AssetProcessingService, 'processDependencies'>;
}

/**
 * Resolves MDX-owned config dependencies that live outside the normal React component tree.
 *
 * React MDX pages can declare dependencies on the page config itself or on a
 * resolved layout config. Those roots need to be materialized as synthetic
 * component configs so the shared dependency pipeline can process them without
 * growing more MDX-specific logic inside the renderer.
 */
export class MdxConfigDependencyService {
	private readonly config: MdxConfigDependencyServiceConfig;

	constructor(config: MdxConfigDependencyServiceConfig) {
		this.config = config;
	}

	/**
	 * Processes MDX-owned config dependencies and eagerly emits any SSR-marked lazy scripts.
	 */
	async processMdxConfigDependencies(options: {
		pagePath: string;
		config?: EcoComponentConfig;
		processComponentDependencies: MdxConfigDependencyProcessor;
	}): Promise<ProcessedAsset[]> {
		const components = this.createOwnedConfigComponents(options.pagePath, options.config);
		if (components.length === 0) {
			return [];
		}

		const processedDependencies = await options.processComponentDependencies(components);
		const eagerSsrLazyDependencies = await this.processDeclaredSsrLazyDependencies(components, options.pagePath);

		return [...processedDependencies, ...eagerSsrLazyDependencies];
	}

	private createOwnedConfigComponents(
		pagePath: string,
		config: EcoComponentConfig | undefined,
	): Partial<EcoComponent>[] {
		const components: Partial<EcoComponent>[] = [];

		for (const layout of config?.layouts ?? []) {
			if (layout?.config?.dependencies) {
				const layoutConfig = this.config.pageModuleService.ensureConfigFileMetadata(layout.config, pagePath);
				components.push({ config: layoutConfig });
			}
		}

		if (config?.dependencies) {
			components.push({
				config: attachEcoFileMetadataToConfig(config, pagePath, this.config.integrationName),
			});
		}

		return components;
	}

	private async processDeclaredSsrLazyDependencies(
		components: Partial<EcoComponent>[],
		pagePath: string,
	): Promise<ProcessedAsset[]> {
		if (!this.config.assetProcessingService?.processDependencies) {
			return [];
		}

		const dependencies = this.collectDeclaredSsrLazyDependencies(components);
		if (dependencies.length === 0) {
			return [];
		}

		return this.config.assetProcessingService.processDependencies(
			dependencies,
			`${this.config.integrationName}-mdx-ssr-lazy:${pagePath}`,
		);
	}

	/**
	 * Collects `lazy` script dependencies that also opt into SSR from an MDX config graph.
	 */
	private collectDeclaredSsrLazyDependencies(components: Partial<EcoComponent>[]): AssetDefinition[] {
		const dependencies: AssetDefinition[] = [];
		const seenKeys = new Set<string>();

		const normalizeAttributes = (attributes?: DependencyAttributes) => ({
			type: 'module',
			defer: '',
			...(attributes ?? {}),
		});

		collectFromConfigForest(getComponentConfigs(components), (config) => {
			const componentFile = config.identity?.file;
			if (!componentFile) {
				return [];
			}

			const componentDir = path.dirname(componentFile);
			for (const script of config.dependencies?.scripts ?? []) {
				if (typeof script === 'string' || !script.lazy || script.ssr !== true) {
					continue;
				}

				const attributes = normalizeAttributes(script.attributes);

				if (script.content) {
					const key = `content:${script.content}:${JSON.stringify(attributes)}`;
					if (seenKeys.has(key)) {
						continue;
					}

					seenKeys.add(key);
					dependencies.push(
						AssetFactory.createContentScript({
							position: 'head',
							content: script.content,
							attributes,
						}),
					);
					continue;
				}

				if (!script.src) {
					continue;
				}

				const resolvedPath = path.resolve(componentDir, script.src);
				const key = `file:${resolvedPath}:${JSON.stringify(attributes)}`;
				if (seenKeys.has(key)) {
					continue;
				}

				seenKeys.add(key);
				dependencies.push(
					AssetFactory.createFileScript({
						filepath: resolvedPath,
						position: 'head',
						attributes,
					}),
				);
			}

			return [];
		});

		return dependencies;
	}
}
