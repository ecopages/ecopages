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
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { invariant } from '@ecopages/core/utils/invariant';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './mdx.plugin.ts';
import { rapidhash } from '@ecopages/core/hash';
import type { MDXFile, MDXRendererOptions } from './mdx.types.ts';

export type { MDXFile, MDXRendererConfig, MDXRendererOptions } from './mdx.types.ts';

/**
 * Options for the MDX renderer
 */
interface MDXIntegrationRendererOptions<C = EcoPagesElement> extends IntegrationRendererRenderOptions<C> {}

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = PLUGIN_NAME;
	readonly compilerOptions: CompileOptions;

	constructor({ mdxConfig, ...options }: MDXRendererOptions) {
		super(options);
		this.compilerOptions = mdxConfig?.compilerOptions ?? {};
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
		);
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createQueuedBoundaryRuntime({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache,
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
	}: MDXIntegrationRendererOptions): Promise<RouteRendererBody> {
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
