import type { HtmlDocumentContribution } from '../../../html/html-transformer.service.ts';
import type {
	IntegrationRendererRenderOptions,
	InternalIntegrationRendererRenderOptions,
} from '../../../types/contracts.ts';
import type { RouteHtmlFinalization } from './route-render-orchestrator.ts';
import { buildRobotsMetaContribution } from './robots-meta.contribution.ts';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import { buildDevToolbarManifestContribution } from '../../../dev-toolbar/dev-toolbar-manifest.ts';

export type RouteHtmlFinalizationContext<C> = {
	appConfig: EcoPagesAppConfig;
	watch: boolean;
	integrationName: string;
	renderOptions: InternalIntegrationRendererRenderOptions<C>;
	getDocumentAttributes: (renderOptions: IntegrationRendererRenderOptions<C>) => Record<string, string> | undefined;
	getHtmlDocumentContributions: (options: {
		renderOptions: IntegrationRendererRenderOptions<C>;
		partial: boolean;
	}) => HtmlDocumentContribution[] | undefined;
	applyAttributesToHtmlElement: (html: string, attributes: Record<string, string>) => string;
};

/**
 * Builds the structural HTML finalization plan for one prepared route render.
 *
 * @remarks
 * Merges core robots meta contributions with integration-owned document
 * contributions so page-level `metadata.robots` works across templates. The
 * development toolbar manifest still comes from the higher Development layer;
 * #556 tracks moving its render contribution behind Rendering.
 */
export function buildRouteHtmlFinalization<C>(context: RouteHtmlFinalizationContext<C>): RouteHtmlFinalization {
	const { renderOptions } = context;
	const documentAttributes = context.getDocumentAttributes(renderOptions);
	const integrationContributions = context.getHtmlDocumentContributions({ renderOptions, partial: false }) ?? [];
	const robotsContribution = buildRobotsMetaContribution(renderOptions.metadata ?? {});
	const devToolbarContribution = buildRouteDevToolbarManifestContribution(context);
	const htmlContributions = [
		...(robotsContribution ? [robotsContribution] : []),
		...(devToolbarContribution ? [devToolbarContribution] : []),
		...integrationContributions,
	];
	const hasStructuralFinalization = documentAttributes && Object.keys(documentAttributes).length > 0;

	if (!hasStructuralFinalization && htmlContributions.length === 0) {
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

function buildRouteDevToolbarManifestContribution<C>(
	context: RouteHtmlFinalizationContext<C>,
): HtmlDocumentContribution | undefined {
	return buildDevToolbarManifestContribution(
		context.appConfig,
		{ watch: context.watch },
		{
			routeFile: context.renderOptions.file,
			integrationName: context.integrationName,
			pagePackage: context.renderOptions.pagePackage,
		},
	);
}
