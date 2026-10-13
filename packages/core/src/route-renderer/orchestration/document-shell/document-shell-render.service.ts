import type {
	BaseIntegrationContext,
	ComponentRenderResult,
	EcoComponent,
	PageMetadataProps,
} from '../../../types/public-types.ts';
import type { InternalComponentRenderInput } from '../../../types/internal-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { getComponentOwner } from '../../../eco/component-identity.ts';

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
	/** The Integration rendering the shell. It owns a shell component that names no owner of its own. */
	integrationName: string;
	renderComponentWithForeignChildren(input: InternalComponentRenderInput): Promise<ComponentRenderResult>;
	appendProcessedDependencies(...assetGroups: Array<readonly ProcessedAsset[] | undefined>): ProcessedAsset[];
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
			integrationName: getComponentOwner(input.primaryComponent, dependencies.integrationName),
		};
	} else {
		primaryRender = await dependencies.renderComponentWithForeignChildren({
			component: input.primaryComponent,
			props: input.primaryProps,
			foreignChildRoots: input.foreignChildRoots,
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
