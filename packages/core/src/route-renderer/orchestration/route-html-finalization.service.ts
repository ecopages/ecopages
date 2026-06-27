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
	applyAttributesToFirstBodyElement: (html: string, attributes: Record<string, string>) => string;
	applyAttributesToHtmlElement: (html: string, attributes: Record<string, string>) => string;
};

/**
 * Builds the structural HTML finalization plan for one prepared route render.
 */
export function buildRouteHtmlFinalization<C>(context: RouteHtmlFinalizationContext<C>): RouteHtmlFinalization {
	const { renderOptions } = context;
	const componentRootAttributes =
		renderOptions.componentRender?.canAttachAttributes &&
		renderOptions.componentRender.rootAttributes &&
		Object.keys(renderOptions.componentRender.rootAttributes).length > 0
			? (renderOptions.componentRender.rootAttributes as Record<string, string>)
			: undefined;
	const documentAttributes = context.getDocumentAttributes(renderOptions);
	const htmlContributions = context.getHtmlDocumentContributions({ renderOptions, partial: false });
	const hasStructuralFinalization =
		(componentRootAttributes && Object.keys(componentRootAttributes).length > 0) ||
		(documentAttributes && Object.keys(documentAttributes).length > 0);

	if (!hasStructuralFinalization && (!htmlContributions || htmlContributions.length === 0)) {
		return {};
	}

	return {
		htmlContributions,
		finalizeHtml: (html) => {
			let renderedHtml = html;

			if (componentRootAttributes) {
				renderedHtml = context.applyAttributesToFirstBodyElement(renderedHtml, componentRootAttributes);
			}

			if (documentAttributes) {
				renderedHtml = context.applyAttributesToHtmlElement(renderedHtml, documentAttributes);
			}

			return renderedHtml;
		},
	};
}
