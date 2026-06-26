import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	PageMetadataProps,
} from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';

export type DocumentShellLayoutInput = {
	component: EcoComponent;
	props?: Record<string, unknown>;
};

export type DocumentShellComposeInput = {
	primaryComponent: EcoComponent;
	primaryProps: Record<string, unknown>;
	layout?: DocumentShellLayoutInput;
	htmlTemplate: EcoComponent;
	documentProps: Record<string, unknown>;
};

export type DocumentShellPageRenderInput = {
	page: {
		component: EcoComponent;
		props: Record<string, unknown>;
	};
	layout?: DocumentShellLayoutInput;
	htmlTemplate: EcoComponent;
	metadata: PageMetadataProps;
	pageProps: Record<string, unknown>;
	documentProps?: Record<string, unknown>;
	transformDocumentHtml?: (html: string) => string;
};

export type DocumentShellRenderDependencies = {
	renderComponentWithForeignChildren(input: ComponentRenderInput): Promise<ComponentRenderResult>;
	appendProcessedDependencies(...assetGroups: Array<readonly ProcessedAsset[] | undefined>): ProcessedAsset[];
};

export type DocumentShellAttributeStamping = {
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string;
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
};

/**
 * Composes page or view content through optional layout and document shells.
 *
 * One execution-scoped renderer cache is threaded through every shell layer so
 * repeated foreign delegation reuses initialized renderers within one render pass.
 */
export async function composeDocumentShell(
	dependencies: DocumentShellRenderDependencies,
	input: DocumentShellComposeInput,
): Promise<{ documentHtml: string }> {
	const rendererCache = new Map<string, unknown>() as BaseIntegrationContext['rendererCache'];
	const primaryRender = await dependencies.renderComponentWithForeignChildren({
		component: input.primaryComponent,
		props: input.primaryProps,
		integrationContext: { rendererCache },
	});
	const layoutRender = input.layout
		? await dependencies.renderComponentWithForeignChildren({
				component: input.layout.component,
				props: input.layout.props ?? {},
				children: primaryRender.html,
				integrationContext: { rendererCache },
			})
		: undefined;
	const documentRender = await dependencies.renderComponentWithForeignChildren({
		component: input.htmlTemplate,
		props: input.documentProps,
		children: layoutRender?.html ?? primaryRender.html,
		integrationContext: { rendererCache },
	});

	dependencies.appendProcessedDependencies(primaryRender.assets, layoutRender?.assets, documentRender.assets);

	return {
		documentHtml: documentRender.html,
	};
}

/**
 * Applies optional component-root and document-root attribute stamping before HTML
 * transformation runs on explicit renderer-owned paths.
 */
export function applyDocumentShellAttributeStamping(
	html: string,
	stamping: DocumentShellAttributeStamping,
	options: {
		componentRootAttributes?: Record<string, string>;
		documentAttributes?: Record<string, string>;
	},
): string {
	let nextHtml = html;

	if (options.componentRootAttributes && Object.keys(options.componentRootAttributes).length > 0) {
		nextHtml = stamping.applyAttributesToFirstBodyElement(nextHtml, options.componentRootAttributes);
	}

	if (options.documentAttributes && Object.keys(options.documentAttributes).length > 0) {
		nextHtml = stamping.applyAttributesToHtmlElement(nextHtml, options.documentAttributes);
	}

	return nextHtml;
}

/**
 * Builds the final serialized document HTML for one route page render.
 */
export async function renderPageDocumentShell(
	dependencies: DocumentShellRenderDependencies,
	input: DocumentShellPageRenderInput,
	docType: string,
): Promise<string> {
	const { documentHtml: composedDocumentHtml } = await composeDocumentShell(dependencies, {
		primaryComponent: input.page.component,
		primaryProps: input.page.props,
		layout: input.layout,
		htmlTemplate: input.htmlTemplate,
		documentProps: {
			metadata: input.metadata,
			pageProps: input.pageProps,
			...(input.documentProps ?? {}),
		},
	});

	const documentHtml = input.transformDocumentHtml
		? input.transformDocumentHtml(composedDocumentHtml)
		: composedDocumentHtml;

	return `${docType}${documentHtml}`;
}
