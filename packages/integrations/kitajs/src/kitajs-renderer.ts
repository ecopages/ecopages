/**
 * This module contains the Kita.js renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { KITAJS_PLUGIN_NAME } from './kitajs.constants.ts';

/** Narrows an EcoComponent to its KitaJS callable signature. */
type KitaViewFn<P> = EcoFunctionComponent<P, Promise<EcoPagesElement> | EcoPagesElement>;

/**
 * A renderer for the Kita.js integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class KitaRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = KITAJS_PLUGIN_NAME;

	private isFunctionComponent(component: EcoComponent): component is KitaViewFn<Record<string, unknown>> {
		return typeof component === 'function';
	}

	/**
	 * Renders a Kita component boundary for component-level orchestration.
	 *
	 * Includes component-scoped dependency assets when declared.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (!this.isFunctionComponent(input.component)) {
			throw new TypeError('Kita renderer expected a callable component.');
		}

		return this.renderStringComponentBoundaryWithQueuedForeignBoundaries(input, input.component);
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
		Layout,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
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
				layout: view.config?.layout,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
