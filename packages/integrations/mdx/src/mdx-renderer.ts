/**
 * This module contains the MDX renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoFunctionComponent,
	EcoPageFile,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { assertIntegrationInvariant } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import { MDX_PLUGIN_NAME } from './mdx.constants.ts';
import { rapidhash } from '@ecopages/core/hash';
import type { MDXRendererOptions } from './mdx.types.ts';

export type { MDXFile, MDXRendererConfig, MDXRendererOptions } from './mdx.types.ts';

/**
 * Options for the MDX renderer
 */
interface MDXIntegrationRendererOptions<C = EcoPagesElement> extends IntegrationRendererRenderOptions<C> {}

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = MDX_PLUGIN_NAME;
	readonly compilerOptions: CompileOptions;

	private isFunctionComponent(
		component: EcoComponent,
	): component is EcoFunctionComponent<Record<string, unknown>, EcoPagesElement | Promise<EcoPagesElement>> {
		return typeof component === 'function';
	}

	constructor({ mdxConfig, ...options }: MDXRendererOptions) {
		super(options);
		this.compilerOptions = mdxConfig?.compilerOptions ?? {};
	}

	override async buildPageBrowserGraph(pagePath: string): Promise<{ assets: ProcessedAsset[] }> {
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

		return {
			assets: await this.resolveDependencies(components),
		};
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
			assertIntegrationInvariant(false, `Error importing MDX file: ${error}`);
		}
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (!this.isFunctionComponent(input.component)) {
			throw new TypeError('MDX renderer expected a callable component.');
		}

		return this.renderStringComponentWithQueuedForeignSubtrees(input, input.component);
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
					component: Page,
					props: { params, query, ...props, locals: pageLocals },
				},
				layout: Layout
					? {
							component: Layout,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate,
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
				layout: view.config?.layout,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
