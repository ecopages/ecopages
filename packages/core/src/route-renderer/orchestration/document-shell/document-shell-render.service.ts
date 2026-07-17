import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	PageMetadataProps,
} from '../../../types/public-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import {
	HtmlTransformerService,
	type HtmlDocumentContribution,
} from '../../../services/html/html-transformer.service.ts';

export type DocumentShellLayoutInput = {
	component: EcoComponent;
	props?: Record<string, unknown>;
};

export type DocumentShellComposeChildrenContext = {
	primaryComponent: EcoComponent;
	primaryProps: Record<string, unknown>;
	primaryRender?: ComponentRenderResult;
	layouts: DocumentShellLayoutInput[];
	rendererCache: BaseIntegrationContext['rendererCache'];
	renderComponentWithForeignChildren: DocumentShellRenderDependencies['renderComponentWithForeignChildren'];
};

export type DocumentShellComposeChildrenResult = {
	/** Serialized or element children passed to the HTML template shell. */
	children: unknown;
	layoutRenders: ComponentRenderResult[];
	/**
	 * Primary/page render assets when the hook performs unified composition.
	 *
	 * @remarks
	 * Omit only when the default sequential string path runs (core renders primary first).
	 */
	primaryRender?: ComponentRenderResult;
};

/**
 * Optional hook that replaces default sequential string layout wrapping.
 *
 * @remarks
 * When provided, core skips the initial primary render and expects the hook to return
 * `children` for the HTML template. Supply `primaryRender` so dependency assets still merge.
 */
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

function resolveComponentIntegrationName(component: EcoComponent): string {
	return component.config?.integration ?? component.config?.__eco?.integration ?? 'ecopages';
}

/**
 * Default sequential string-child composition for document shell layers.
 */
export async function composeSequentialLayoutChildren(
	context: DocumentShellComposeChildrenContext,
): Promise<DocumentShellComposeChildrenResult> {
	if (!context.primaryRender) {
		throw new Error('[ecopages] composeSequentialLayoutChildren requires primaryRender.');
	}

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
	const composeChildren = input.composeChildren ?? composeSequentialLayoutChildren;
	const usesCustomComposeChildren = input.composeChildren !== undefined;

	let primaryRender: ComponentRenderResult;
	let children: unknown;
	let layoutRenders: ComponentRenderResult[];

	if (usesCustomComposeChildren) {
		const composed = await composeChildren({
			primaryComponent: input.primaryComponent,
			primaryProps: input.primaryProps,
			layouts,
			rendererCache,
			renderComponentWithForeignChildren: dependencies.renderComponentWithForeignChildren,
		});
		children = composed.children;
		layoutRenders = composed.layoutRenders;
		primaryRender = composed.primaryRender ?? {
			html: typeof composed.children === 'string' ? composed.children : '',
			assets: [],
			canAttachAttributes: true,
			rootTag: 'main',
			integrationName: resolveComponentIntegrationName(input.primaryComponent),
		};
	} else {
		primaryRender = await dependencies.renderComponentWithForeignChildren({
			component: input.primaryComponent,
			props: input.primaryProps,
			integrationContext: { rendererCache },
		});
		const composed = await composeChildren({
			primaryComponent: input.primaryComponent,
			primaryProps: input.primaryProps,
			primaryRender,
			layouts,
			rendererCache,
			renderComponentWithForeignChildren: dependencies.renderComponentWithForeignChildren,
		});
		children = composed.children;
		layoutRenders = composed.layoutRenders;
	}
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

/**
 * Finalizes already-resolved HTML for explicit renderer-owned paths.
 *
 * @remarks
 * Callers append renderer bootstrap dependencies before invoking this helper.
 * Stamps document/root attributes and runs HTML transformation after nested
 * foreign-subtree resolution without routing back through shared route execution.
 */
export async function finalizeDocumentShellHtml(
	htmlTransformer: HtmlTransformerService,
	options: {
		html: string;
		partial?: boolean;
		componentRootAttributes?: Record<string, string>;
		documentAttributes?: Record<string, string>;
		transformHtml?: boolean;
		htmlContributions?: HtmlDocumentContribution[];
	},
): Promise<string> {
	const html = applyDocumentShellAttributeStamping(
		options.html,
		{
			applyAttributesToFirstBodyElement: (nextHtml, attributes) =>
				htmlTransformer.applyAttributesToFirstBodyElement(nextHtml, attributes),
			applyAttributesToHtmlElement: (nextHtml, attributes) =>
				htmlTransformer.applyAttributesToHtmlElement(nextHtml, attributes),
		},
		{
			componentRootAttributes: options.componentRootAttributes,
			documentAttributes: options.documentAttributes,
		},
	);

	const shouldTransform = options.transformHtml ?? !options.partial;
	if (!shouldTransform) {
		return html;
	}

	const transformedResponse = await htmlTransformer.transform(
		new Response(html, {
			headers: { 'Content-Type': 'text/html' },
		}),
		options.htmlContributions,
	);
	return await transformedResponse.text();
}
