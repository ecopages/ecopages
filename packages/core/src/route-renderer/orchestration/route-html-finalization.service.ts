import type { HtmlDocumentContribution } from '../../services/html/html-transformer.service.ts';
import type { IntegrationRendererRenderOptions } from '../../types/public-types.ts';
import type { RouteHtmlFinalization } from './route-render-orchestrator.ts';

export type RouteHtmlFinalizationContext<C> = {
	renderOptions: IntegrationRendererRenderOptions<C>;
	getDocumentAttributes: (renderOptions: IntegrationRendererRenderOptions<C>) => Record<string, string> | undefined;
	getHtmlDocumentContributions: (options: {
		renderOptions: IntegrationRendererRenderOptions<C>;
		partial: boolean;
	}) => HtmlDocumentContribution[] | undefined;
	applyAttributesToHtmlElement: (html: string, attributes: Record<string, string>) => string;
};

/**
 * Builds the structural HTML finalization plan for one prepared route render.
 */
export function buildRouteHtmlFinalization<C>(context: RouteHtmlFinalizationContext<C>): RouteHtmlFinalization {
	const { renderOptions } = context;
	const documentAttributes = context.getDocumentAttributes(renderOptions);
	const htmlContributions = context.getHtmlDocumentContributions({ renderOptions, partial: false });
	const hasStructuralFinalization = documentAttributes && Object.keys(documentAttributes).length > 0;

	if (!hasStructuralFinalization && (!htmlContributions || htmlContributions.length === 0)) {
		return {};
	}

	return {
		htmlContributions,
		finalizeHtml: (html) => {
			if (!documentAttributes || Object.keys(documentAttributes).length === 0) {
				return html;
			}

			return context.applyAttributesToHtmlElement(html, documentAttributes);
		},
	};
}
