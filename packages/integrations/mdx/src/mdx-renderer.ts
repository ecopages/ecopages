/**
 * This module contains the MDX renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
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
import { rapidhash } from '@ecopages/core/hash';

const MDX_BOUNDARY_TOKEN_PREFIX = '__ECO_MDX_BOUNDARY__';
const MDX_BOUNDARY_RUNTIME_CONTEXT_KEY = '__mdxBoundaryRuntime';

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
		const { default: pageComponent } = await this.importPageFile(pagePath);
		const config = pageComponent.config;
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
						id: rapidhash(pagePath).toString(36),
						file: pagePath,
						integration: this.name,
					},
				},
			});
		}

		return await this.resolveDependencies(components);
	}

	protected override normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		_file: string,
		pageModule: TPageModule,
	): TPageModule {
		try {
			const mdxModule = pageModule as TPageModule & { config?: EcoComponentConfig };
			const { default: Page, config, getMetadata } = mdxModule;

			if (typeof Page !== 'function') {
				throw new Error('MDX file must export a default function');
			}

			const resolvedLayout = config?.layout;

			if (config) Page.config = config;

			return {
				...pageModule,
				default: Page,
				layout: resolvedLayout,
				getMetadata,
			} as TPageModule;
		} catch (error) {
			invariant(false, `Error importing MDX file: ${error}`);
		}
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		return this.renderStringComponentBoundaryWithQueuedForeignBoundaries(
			input,
			input.component as (props: Record<string, unknown>) => Promise<EcoPagesElement> | EcoPagesElement,
			{
				runtimeContextKey: MDX_BOUNDARY_RUNTIME_CONTEXT_KEY,
				tokenPrefix: MDX_BOUNDARY_TOKEN_PREFIX,
			},
		);
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createStringBoundaryRuntime({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache,
			runtimeContextKey: MDX_BOUNDARY_RUNTIME_CONTEXT_KEY,
			tokenPrefix: MDX_BOUNDARY_TOKEN_PREFIX,
		});
	}

	async render({
		params,
		query,
		props,
		locals,
		pageLocals,
		metadata,
		Page,
		HtmlTemplate,
		Layout,
		pageProps,
	}: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
		try {
			return await this.renderPageWithDocumentShell({
				page: {
					component: Page as EcoComponent,
					props: { params, query, ...props, locals: pageLocals },
				},
				layout: Layout
					? {
							component: Layout as EcoComponent,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate as EcoComponent,
				metadata,
				pageProps: pageProps || {},
			});
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
			return await this.renderViewWithDocumentShell({
				view,
				props,
				ctx,
				layout: view.config?.layout as EcoComponent | undefined,
			});
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
