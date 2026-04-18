import path from 'node:path';
import type { DependencyAttributes, EcoComponent, EcoComponentConfig } from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import {
	AssetFactory,
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import { collectFromConfigForest, getComponentConfigs } from '../utils/component-config-traversal.ts';
import type { ReactPageModuleService } from './react-page-module.service.ts';

type MdxConfigDependencyProcessor = (components: Partial<EcoComponent>[]) => Promise<ProcessedAsset[]>;

export interface ReactMdxConfigDependencyServiceConfig {
	integrationName: string;
	pageModuleService: Pick<ReactPageModuleService, 'ensureConfigFileMetadata'>;
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
export class ReactMdxConfigDependencyService {
	private readonly config: ReactMdxConfigDependencyServiceConfig;

	constructor(config: ReactMdxConfigDependencyServiceConfig) {
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
		const resolvedLayout = config?.layout;

		if (resolvedLayout?.config?.dependencies) {
			const layoutConfig = this.config.pageModuleService.ensureConfigFileMetadata(resolvedLayout.config, pagePath);
			components.push({ config: layoutConfig });
		}

		if (config?.dependencies) {
			components.push({
				config: {
					...config,
					__eco: {
						id: rapidhash(pagePath).toString(36),
						file: pagePath,
						integration: this.config.integrationName,
					},
				},
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
			const componentFile = config.__eco?.file;
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