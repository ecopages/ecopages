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

export type DocumentShellComposeChildrenContext = {
	primaryRender: ComponentRenderResult;
	layouts: DocumentShellLayoutInput[];
	rendererCache: BaseIntegrationContext['rendererCache'];
	renderComponentWithForeignChildren: DocumentShellRenderDependencies['renderComponentWithForeignChildren'];
};

export type DocumentShellComposeChildrenResult = {
	children: unknown;
	layoutRenders: ComponentRenderResult[];
};

export type DocumentShellComposeChildrenHook = (
	context: DocumentShellComposeChildrenContext,
) => Promise<DocumentShellComposeChildrenResult>;

export type DocumentShellComposeInput = {
	primaryComponent: EcoComponent;
	primaryProps: Record<string, unknown>;
	layout?: DocumentShellLayoutInput;
	layouts?: DocumentShellLayoutInput[];
	composeChildren?: DocumentShellComposeChildrenHook;
	htmlTemplate: EcoComponent;
	documentProps: Record<string, unknown>;
};

export type DocumentShellPageRenderInput = {
	page: {
		component: EcoComponent;
		props: Record<string, unknown>;
	};
	layout?: DocumentShellLayoutInput;
	layouts?: DocumentShellLayoutInput[];
	composeChildren?: DocumentShellComposeChildrenHook;
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

function resolveDocumentShellLayouts(
	input: Pick<DocumentShellComposeInput, 'layout' | 'layouts'>,
): DocumentShellLayoutInput[] {
	if (input.layouts && input.layouts.length > 0) {
		return input.layouts;
	}

	return input.layout ? [input.layout] : [];
}

/**
 * Default sequential string-child composition for document shell layers.
 */
export async function composeSequentialLayoutChildren(
	context: DocumentShellComposeChildrenContext,
): Promise<DocumentShellComposeChildrenResult> {
	let children: unknown = context.primaryRender.html;
	const layoutRenders: ComponentRenderResult[] = [];

	for (const layout of [...context.layouts].reverse()) {
		const layoutRender = await context.renderComponentWithForeignChildren({
			component: layout.component,
			props: layout.props ?? {},
			children,
			integrationContext: { rendererCache: context.rendererCache },
		});
		layoutRenders.push(layoutRender);
		children = layoutRender.html;
	}

	return {
		children,
		layoutRenders,
	};
}

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
	const layouts = resolveDocumentShellLayouts(input);
	const primaryRender = await dependencies.renderComponentWithForeignChildren({
		component: input.primaryComponent,
		props: input.primaryProps,
		integrationContext: { rendererCache },
	});
	const composeChildren = input.composeChildren ?? composeSequentialLayoutChildren;
	const { children, layoutRenders } = await composeChildren({
		primaryRender,
		layouts,
		rendererCache,
		renderComponentWithForeignChildren: dependencies.renderComponentWithForeignChildren,
	});
	const documentRender = await dependencies.renderComponentWithForeignChildren({
		component: input.htmlTemplate,
		props: input.documentProps,
		children,
		integrationContext: { rendererCache },
	});

	dependencies.appendProcessedDependencies(
		primaryRender.assets,
		...layoutRenders.map((layoutRender) => layoutRender.assets),
		documentRender.assets,
	);

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
		layouts: input.layouts,
		composeChildren: input.composeChildren,
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
