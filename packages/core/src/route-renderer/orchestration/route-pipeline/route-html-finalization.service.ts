import type { HtmlDocumentContribution } from '../../../services/html/html-transformer.service.ts';
import type { IntegrationRendererRenderOptions } from '../../../types/public-types.ts';
import type { RouteHtmlFinalization } from './route-render-orchestrator.ts';
import { buildRobotsMetaContribution } from './robots-meta.contribution.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import { DevToolbarHost } from '../../../dev-toolbar/dev-toolbar-host.ts';

export type RouteHtmlFinalizationContext<C> = {
	appConfig: EcoPagesAppConfig;
	watch: boolean;
	hostOwnsDevClient?: boolean;
	integrationName: string;
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
 *
 * @remarks
 * Merges core robots meta contributions with integration-owned document
 * contributions so page-level `metadata.robots` works across templates.
 */
export function buildRouteHtmlFinalization<C>(context: RouteHtmlFinalizationContext<C>): RouteHtmlFinalization {
	const { renderOptions } = context;
	const documentAttributes = context.getDocumentAttributes(renderOptions);
	const integrationContributions = context.getHtmlDocumentContributions({ renderOptions, partial: false }) ?? [];
	const robotsContribution = buildRobotsMetaContribution(renderOptions.metadata ?? {});
	const devToolbarContribution = buildDevToolbarManifestContribution(context);
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

function buildDevToolbarManifestContribution<C>(
	context: RouteHtmlFinalizationContext<C>,
): HtmlDocumentContribution | undefined {
	return DevToolbarHost.forApp(context.appConfig, {
		watch: context.watch,
		hostOwnsDevClient: context.hostOwnsDevClient,
	}).buildRouteManifestContribution({
		routeFile: context.renderOptions.file,
		integrationName: context.integrationName,
		pagePackage: context.renderOptions.pagePackage,
	});
}
