/**
 * This module contains the MDX renderer
 * @module
 */

import path from 'node:path';
import {
	type EcoComponent,
	type EcoComponentConfig,
	type EcoPageFile,
	type EcoPagesElement,
	type GetMetadata,
	IntegrationRenderer,
	type IntegrationRendererRenderOptions,
	invariant,
	type RouteRendererBody,
} from '@ecopages/core';
import type { AssetProcessingService, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './mdx.plugin.ts';

/**
 * A structure representing an MDX file
 */
export type MDXFile = {
	default: EcoComponent;
	config?: EcoComponentConfig;
	getMetadata: GetMetadata;
};

/**
 * Options for the MDX renderer
 */
interface MDXIntegrationRendererOpions<C = EcoPagesElement> extends IntegrationRendererRenderOptions<C> {}

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = PLUGIN_NAME;
	compilerOptions: CompileOptions;

	constructor({
		compilerOptions,
		...options
	}: {
		appConfig: any;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies: ProcessedAsset[];
		runtimeOrigin: string;
		compilerOptions?: CompileOptions;
	}) {
		super(options);
		this.compilerOptions = compilerOptions || {};
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		const { config } = await import(pagePath);
		const components: Partial<EcoComponent>[] = [];

		const resolvedLayout = config?.layout;

		if (resolvedLayout?.config?.dependencies) {
			components.push({ config: resolvedLayout.config });
		}

		if (config?.dependencies) {
			components.push({
				config: {
					...config,
					componentDir: path.dirname(pagePath),
				},
			});
		}

		return await this.resolveDependencies(components);
	}

	protected override async importPageFile(file: string): Promise<
		EcoPageFile<{
			layout?:
				| EcoComponent<any>
				| {
						config: EcoComponentConfig | undefined;
				  };
		}>
	> {
		try {
			const { default: Page, config, getMetadata } = await import(file);

			if (typeof Page !== 'function') {
				throw new Error('MDX file must export a default function');
			}

			const resolvedLayout = config?.layout;

			return {
				default: Page,
				layout: resolvedLayout,
				getMetadata,
			};
		} catch (error) {
			invariant(false, `Error importing MDX file: ${error}`);
		}
	}

	async render({
		metadata,
		Page,
		HtmlTemplate,
		Layout,
		pageProps,
	}: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
		try {
			const children = typeof Layout === 'function' ? Layout({ children: Page({}) }) : Page({});

			const body = await HtmlTemplate({
				metadata,
				children,
				pageProps: pageProps || {},
			});

			return this.DOC_TYPE + body;
		} catch (error) {
			throw new Error(`[ecopages] Error rendering page: ${error}`);
		}
	}
}

/**
 * Factory function to create an MDX renderer class with specific compiler options.
 *
 * @param compilerOptions - Compiler options for MDX compilation.
 * @returns A new MDXRenderer class extended with the provided context.
 */
export function createMDXRenderer(compilerOptions: CompileOptions): typeof MDXRenderer {
	return class extends MDXRenderer {
		constructor(options: {
			appConfig: any;
			assetProcessingService: AssetProcessingService;
			resolvedIntegrationDependencies: ProcessedAsset[];
			runtimeOrigin: string;
		}) {
			super({
				...options,
				compilerOptions,
			});
		}
	};
}
