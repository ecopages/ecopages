/**
 * This module contains the ghtml renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '../../types/public-types.ts';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '../../route-renderer/orchestration/integration-renderer.ts';
import { GHTML_PLUGIN_NAME } from './ghtml.plugin.ts';

const GHTML_BOUNDARY_TOKEN_PREFIX = '__ECO_GHTML_BOUNDARY__';
const GHTML_BOUNDARY_RUNTIME_CONTEXT_KEY = '__ghtmlBoundaryRuntime';

type GhtmlViewFn<P> = (props: P) => Promise<EcoPagesElement> | EcoPagesElement;
type GhtmlLayoutFn = (
	props: { children: string } & Record<string, unknown>,
) => Promise<EcoPagesElement> | EcoPagesElement;

/**
 * A renderer for the ghtml integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class GhtmlRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = GHTML_PLUGIN_NAME;

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		return this.renderStringComponentBoundaryWithQueuedForeignBoundaries(
			input,
			input.component as GhtmlViewFn<Record<string, unknown>>,
			{
				runtimeContextKey: GHTML_BOUNDARY_RUNTIME_CONTEXT_KEY,
				tokenPrefix: GHTML_BOUNDARY_TOKEN_PREFIX,
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
			runtimeContextKey: GHTML_BOUNDARY_RUNTIME_CONTEXT_KEY,
			tokenPrefix: GHTML_BOUNDARY_TOKEN_PREFIX,
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
		Layout,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
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
				pageProps: props ?? {},
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
				layout: view.config?.layout as GhtmlLayoutFn | undefined,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
