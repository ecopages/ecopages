import { path } from '@ecopages/file-system/path';
import {
	getComponentIdentity,
	type DependencyAttributes,
	type EcoComponent,
	type EcoComponentConfig,
} from '@ecopages/core';
import { attachEcoFileMetadataToConfig } from '@ecopages/core/integration';
import { AssetFactory, type AssetDefinition } from '@ecopages/core/integration';
import { collectFromConfigForest, getComponentConfigs } from '../client-graph/component-config-traversal.ts';
import type { PageModuleService } from '../page/page-module.ts';

export interface MdxConfigDependencyServiceConfig {
	integrationName: string;
	/** The app root that root-relative identity files resolve against. */
	rootDir: string;
	pageModuleService: Pick<PageModuleService, 'ensureConfigFileMetadata'>;
}

/**
 * Resolves MDX-owned config dependencies that live outside the normal React component tree.
 *
 * React MDX pages can declare dependencies on the page config itself or on a
 * resolved layout config. Those roots become synthetic component configs that core
 * processes through the shared dependency pipeline, and plans for the app-wide browser build.
 */
export class MdxConfigDependencyService {
	private readonly config: MdxConfigDependencyServiceConfig;

	constructor(config: MdxConfigDependencyServiceConfig) {
		this.config = config;
	}

	/**
	 * Returns the MDX-owned config components and, as eager head scripts, their SSR-marked lazy scripts.
	 */
	collectMdxConfigContribution(
		pagePath: string,
		config: EcoComponentConfig | undefined,
	): { components: Partial<EcoComponent>[]; bundledScripts: AssetDefinition[] } {
		const components = this.createOwnedConfigComponents(pagePath, config);
		return { components, bundledScripts: this.collectDeclaredSsrLazyDependencies(components) };
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
			const componentFile = getComponentIdentity(config)?.file;
			if (!componentFile) {
				return [];
			}

			const componentDir = path.dirname(path.resolve(this.config.rootDir, componentFile));
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
