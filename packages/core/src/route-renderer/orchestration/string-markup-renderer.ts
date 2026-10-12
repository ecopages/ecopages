import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoFunctionComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '../../types/public-types.ts';
import { IntegrationRenderer } from './integration-renderer.ts';
import { resolveDocumentShellLayouts } from './document-shell/layout-shell-props.service.ts';

type StringMarkupViewFn<P = Record<string, unknown>> = EcoFunctionComponent<
	P,
	Promise<EcoPagesElement> | EcoPagesElement
>;

/**
 * Base renderer for integrations whose page output is string HTML markup.
 *
 * @remarks
 * Test string fixtures, KitaJS, and MDX share the same document-shell rendering path. Subclasses
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
		layoutEntries,
		HtmlTemplate,
		pageProps,
		resolvedPageDependencyComponents,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		try {
			return await this.renderPageWithDocumentShell({
				page: {
					component: Page,
					props: { params, query, ...props, locals: pageLocals },
				},
				layouts: resolveDocumentShellLayouts({
					layout: Layout,
					layoutEntries,
					params,
					query,
					locals,
				}),
				htmlTemplate: HtmlTemplate,
				metadata,
				pageProps: pageProps ?? props ?? {},
				foreignChildRoots: resolvedPageDependencyComponents,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}
}
