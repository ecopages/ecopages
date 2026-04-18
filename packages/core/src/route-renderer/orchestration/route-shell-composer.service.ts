import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	HtmlTemplateProps,
	PageMetadataProps,
} from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { RenderToResponseContext } from './integration-renderer.ts';

type ShellRendererCache = BaseIntegrationContext['rendererCache'];

export interface RouteShellComposerCallbacks {
	hasForeignBoundaryDescendants(component: EcoComponent): boolean;
	createHtmlResponse(body: BodyInit, ctx: RenderToResponseContext): Response;
	renderComponentBoundary(input: ComponentRenderInput): Promise<ComponentRenderResult>;
	prepareViewDependencies(view: EcoComponent, layout?: EcoComponent): Promise<ProcessedAsset[]>;
	getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>>;
	resolveViewMetadata<P>(view: EcoComponent<P>, props: P): Promise<PageMetadataProps>;
	appendProcessedDependencies(...assetGroups: Array<readonly ProcessedAsset[] | undefined>): ProcessedAsset[];
	finalizeResolvedHtml(options: {
		html: string;
		partial?: boolean;
		componentRootAttributes?: Record<string, string>;
		documentAttributes?: Record<string, string>;
		transformHtml?: boolean;
	}): Promise<string>;
	docType: string;
}

export class RouteShellComposer {
	async renderPartialViewResponse<P>(
		input: {
			view: EcoComponent<P>;
			props: P;
			ctx: RenderToResponseContext;
			renderInline?: () => Promise<BodyInit>;
			transformHtml?: (html: string) => string;
		},
		callbacks: RouteShellComposerCallbacks,
	): Promise<Response> {
		if (input.renderInline && !callbacks.hasForeignBoundaryDescendants(input.view as EcoComponent)) {
			return callbacks.createHtmlResponse(await input.renderInline(), input.ctx);
		}

		const rendererCache = new Map<string, unknown>() as ShellRendererCache;
		const viewRender = await callbacks.renderComponentBoundary({
			component: input.view as EcoComponent,
			props: (input.props ?? {}) as Record<string, unknown>,
			integrationContext: { rendererCache },
		});
		const html = input.transformHtml ? input.transformHtml(viewRender.html) : viewRender.html;

		return callbacks.createHtmlResponse(html, input.ctx);
	}

	async renderViewWithDocumentShell<P>(
		input: {
			view: EcoComponent<P>;
			props: P;
			ctx: RenderToResponseContext;
			layout?: EcoComponent;
		},
		callbacks: RouteShellComposerCallbacks,
	): Promise<Response> {
		const normalizedProps = (input.props ?? {}) as Record<string, unknown>;

		if (input.ctx.partial) {
			return this.renderPartialViewResponse(input, callbacks);
		}

		await callbacks.prepareViewDependencies(input.view, input.layout);

		const HtmlTemplate = await callbacks.getHtmlTemplate();
		const metadata = await callbacks.resolveViewMetadata(input.view, input.props);
		const rendererCache = new Map<string, unknown>() as ShellRendererCache;
		const viewRender = await callbacks.renderComponentBoundary({
			component: input.view as EcoComponent,
			props: normalizedProps,
			integrationContext: { rendererCache },
		});
		const layoutRender = input.layout
			? await callbacks.renderComponentBoundary({
					component: input.layout,
					props: {},
					children: viewRender.html,
					integrationContext: { rendererCache },
			  })
			: undefined;
		const documentRender = await callbacks.renderComponentBoundary({
			component: HtmlTemplate as EcoComponent,
			props: {
				metadata,
				pageProps: normalizedProps,
			},
			children: layoutRender?.html ?? viewRender.html,
			integrationContext: { rendererCache },
		});

		callbacks.appendProcessedDependencies(viewRender.assets, layoutRender?.assets, documentRender.assets);

		const html = await callbacks.finalizeResolvedHtml({
			html: `${callbacks.docType}${documentRender.html}`,
			partial: false,
		});

		return callbacks.createHtmlResponse(html, input.ctx);
	}

	async renderPageWithDocumentShell(
		input: {
			page: {
				component: EcoComponent;
				props: Record<string, unknown>;
			};
			layout?: {
				component: EcoComponent;
				props?: Record<string, unknown>;
			};
			htmlTemplate: EcoComponent;
			metadata: PageMetadataProps;
			pageProps: Record<string, unknown>;
			documentProps?: Record<string, unknown>;
			transformDocumentHtml?: (html: string) => string;
		},
		callbacks: RouteShellComposerCallbacks,
	): Promise<string> {
		const rendererCache = new Map<string, unknown>() as ShellRendererCache;
		const pageRender = await callbacks.renderComponentBoundary({
			component: input.page.component,
			props: input.page.props,
			integrationContext: { rendererCache },
		});
		const layoutRender = input.layout
			? await callbacks.renderComponentBoundary({
					component: input.layout.component,
					props: input.layout.props ?? {},
					children: pageRender.html,
					integrationContext: { rendererCache },
			  })
			: undefined;
		const documentRender = await callbacks.renderComponentBoundary({
			component: input.htmlTemplate,
			props: {
				metadata: input.metadata,
				pageProps: input.pageProps,
				...(input.documentProps ?? {}),
			},
			children: layoutRender?.html ?? pageRender.html,
			integrationContext: { rendererCache },
		});

		callbacks.appendProcessedDependencies(pageRender.assets, layoutRender?.assets, documentRender.assets);

		const documentHtml = input.transformDocumentHtml
			? input.transformDocumentHtml(documentRender.html)
			: documentRender.html;

		return `${callbacks.docType}${documentHtml}`;
	}
}