/**
 * This module contains the MDX renderer
 * @module
 */

import path from 'node:path';
import type {
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	EcoPagesElement,
	GetMetadata,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { invariant } from '@ecopages/core/utils/invariant';
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
					__eco: {
						id: Bun.hash(pagePath).toString(36),
						file: pagePath,
						integration: this.name,
					},
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

			if (config) Page.config = config;

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
		params,
		query,
		props,
		locals,
		metadata,
		Page,
		HtmlTemplate,
		Layout,
		pageProps,
	}: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
		try {
			const pageContent = await Page({ params, query, ...props, locals });
			const children =
				typeof Layout === 'function' ? await Layout({ children: pageContent, locals }) : pageContent;

			const body = await HtmlTemplate({
				metadata,
				children,
				pageProps: pageProps || {},
			});

			return this.DOC_TYPE + body;
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const Layout = view.config?.layout as
				| ((props: { children: EcoPagesElement } & Record<string, unknown>) => Promise<EcoPagesElement>)
				| undefined;

			const viewFn = view as (props: P) => Promise<EcoPagesElement>;
			const pageContent = await viewFn(props);

			let body: string;
			if (ctx.partial) {
				body = pageContent as string;
			} else {
				const children = Layout ? await Layout({ children: pageContent }) : pageContent;

				const HtmlTemplate = await this.getHtmlTemplate();
				const metadata: PageMetadataProps = view.metadata
					? await view.metadata({
							params: {},
							query: {},
							props: props as Record<string, unknown>,
							appConfig: this.appConfig,
						})
					: this.appConfig.defaultMetadata;

				body =
					this.DOC_TYPE +
					(await HtmlTemplate({
						metadata,
						children: children as EcoPagesElement,
						pageProps: props as Record<string, unknown>,
					}));
			}

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
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
