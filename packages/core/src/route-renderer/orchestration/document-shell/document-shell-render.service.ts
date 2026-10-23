import type {
	BaseIntegrationContext,
	ComponentRenderResult,
	EcoComponent,
	PageMetadataProps,
} from '../../../types/contracts.ts';
import type { InternalComponentRenderInput } from '../../../config/internal-types.ts';
import { getComponentRenderContext } from '../../../eco/component-render-context.ts';
import type { RouteRenderContextState } from '../foreign-child/render-session.ts';

export type DocumentShellLayoutInput = {
	component: EcoComponent;
	props?: Record<string, unknown>;
};

export type DocumentShellComposeChildrenContext = {
	primaryComponent: EcoComponent;
	primaryProps: Record<string, unknown>;
	layouts: DocumentShellLayoutInput[];
	rendererCache: BaseIntegrationContext['rendererCache'];
	renderComponentWithForeignChildren: DocumentShellRenderDependencies['renderComponentWithForeignChildren'];
};

export type DocumentShellComposeChildrenResult = {
	/** Serialized or element children passed to the HTML template shell. */
	children: unknown;
};

/**
 * Optional hook that replaces default sequential string layout wrapping.
 *
 * @remarks
 * When provided, core skips the initial primary render and expects the hook to return
 * `children` for the HTML template.
 */
export type DocumentShellComposeChildrenHook = (
	context: DocumentShellComposeChildrenContext,
) => Promise<DocumentShellComposeChildrenResult>;

export type DocumentShellComposeInput = {
	primaryComponent: EcoComponent;
	primaryProps: Record<string, unknown>;
	/** Components whose ownership graphs must join the foreign-child decision. */
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
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
	/** Components whose ownership graphs must join the foreign-child decision. */
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
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
	renderComponentWithForeignChildren(input: InternalComponentRenderInput): Promise<ComponentRenderResult>;
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
	primaryHtml: string,
): Promise<DocumentShellComposeChildrenResult> {
	let children: unknown = primaryHtml;

	for (const layout of [...context.layouts].reverse()) {
		const layoutRender = await context.renderComponentWithForeignChildren({
			component: layout.component,
			props: layout.props ?? {},
			children,
			integrationContext: { rendererCache: context.rendererCache },
		});
		children = layoutRender.html;
	}

	return { children };
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
	const rendererCache = (getComponentRenderContext<RouteRenderContextState>()?.renderState?.session?.rendererCache ??
		new Map<string, unknown>()) as BaseIntegrationContext['rendererCache'];
	const layouts = resolveDocumentShellLayouts(input);
	const composeContext = {
		primaryComponent: input.primaryComponent,
		primaryProps: input.primaryProps,
		layouts,
		rendererCache,
		renderComponentWithForeignChildren: dependencies.renderComponentWithForeignChildren,
	};
	const { children } = input.composeChildren
		? await input.composeChildren(composeContext)
		: await composeSequentialLayoutChildren(
				composeContext,
				(
					await dependencies.renderComponentWithForeignChildren({
						component: input.primaryComponent,
						props: input.primaryProps,
						foreignChildRoots: input.foreignChildRoots,
						integrationContext: { rendererCache },
					})
				).html,
			);
	const documentRender = await dependencies.renderComponentWithForeignChildren({
		component: input.htmlTemplate,
		props: input.documentProps,
		children,
		integrationContext: { rendererCache },
	});

	return {
		documentHtml: documentRender.html,
	};
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
		foreignChildRoots: input.foreignChildRoots,
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
