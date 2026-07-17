import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '../../types/public-types.ts';
import { IntegrationRenderer, type RenderToResponseContext } from './integration-renderer.ts';
import { resolveInnermostPageLayout } from './document-shell/layout-shell-props.service.ts';

type StringMarkupViewFn<P = Record<string, unknown>> = EcoFunctionComponent<
	P,
	Promise<EcoPagesElement> | EcoPagesElement
>;

/**
 * Base renderer for integrations whose page output is string HTML markup.
 *
 * @remarks
 * Ghtml, KitaJS, and MDX share the same document-shell rendering path. Subclasses
 * only need to set `name` and override hooks for integration-specific behavior.
 */
export abstract class StringMarkupRenderer extends IntegrationRenderer<EcoPagesElement> {
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (typeof input.component !== 'function') {
			throw new TypeError(`${this.name} renderer expected a callable component.`);
		}

		return this.renderStringComponentWithQueuedForeignSubtrees(input, input.component as StringMarkupViewFn);
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
		pageProps,
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
				pageProps: pageProps ?? props ?? {},
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
				layout: resolveInnermostPageLayout(view.config?.layouts),
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
