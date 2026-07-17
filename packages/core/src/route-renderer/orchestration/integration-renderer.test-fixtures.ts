import { vi } from 'vitest';
import { resolveInnermostPageLayout } from './document-shell/layout-shell-props.service.ts';
import { finalizeDocumentShellHtml } from './document-shell/document-shell-render.service.ts';
import {
	IntegrationRenderer,
	type HtmlDocumentContribution,
	type RenderToResponseContext,
} from './integration-renderer.ts';
import { getComponentRenderContext, type ForeignChildRuntime } from './foreign-child/component-render-context.ts';
import { toForeignSubtreeRenderPayload } from './foreign-child/foreign-subtree-execution.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	EcoPageFile,
	RouteRendererBody,
	RouteRendererOptions,
	EcoComponent,
	HtmlTemplateProps,
} from '../../types/public-types.ts';
import type { PagePackageResult } from '../../types/public-types.ts';

export function createUnresolvedMarkerArtifact(nodeId: string, componentRef: string, propsRef: string): string {
	return `<eco-marker data-eco-node-id="${nodeId}" data-eco-component-ref="${componentRef}" data-eco-props-ref="${propsRef}"></eco-marker>`;
}

export function createMockIntegrationPlugin(
	plugin: { name: string } & Record<string, unknown>,
): EcoPagesAppConfig['integrations'][number] {
	return {
		setConfig: vi.fn(),
		setRuntimeOrigin: vi.fn(),
		setup: vi.fn(async () => {}),
		...plugin,
	} as unknown as EcoPagesAppConfig['integrations'][number];
}

export const testAppConfig = {
	absolutePaths: {
		pagesDir: '/app/pages',
		htmlTemplatePath: '/app/index.ghtml.ts',
	},
	integrations: [],
	defaultMetadata: {
		title: 'Default Title',
		description: 'Default Description',
	},
	srcDir: '/app',
} as unknown as EcoPagesAppConfig;

export const testAssetService = {
	processDependencies: vi.fn(() => Promise.resolve([])),
} as unknown as AssetProcessingService;

/**
 * Concrete implementation with ed file loading for testing purposes.
 */
export class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';
	ForeignChildRuntimeCreationCount = 0;
	ForeignChildRenderCount = 0;
	UseFailFastForeignChildRuntime = false;

	PageModule: EcoPageFile | null = null;
	HtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;
	RenderedBody: RouteRendererBody = '<html><body>Test Page</body></html>';
	RenderBodyFactory:
		| ((context: ReturnType<typeof getComponentRenderContext>) => RouteRendererBody | Promise<RouteRendererBody>)
		| null = null;
	MockComponentRenderResult: ComponentRenderResult | null = null;
	ImportedFiles: string[] = [];
	HtmlContributions: HtmlDocumentContribution[] = [];

	async render(_options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		if (this.RenderBodyFactory) {
			return await this.RenderBodyFactory(getComponentRenderContext());
		}

		return this.RenderedBody;
	}

	override async renderComponent(_input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (this.MockComponentRenderResult) {
			return this.MockComponentRenderResult;
		}

		return super.renderComponent(_input);
	}

	override async renderComponentWithForeignChildren(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		this.ForeignChildRenderCount += 1;
		return await super.renderComponentWithForeignChildren(input);
	}

	async renderToResponse<P>(view: EcoComponent<P>, props: P, ctx: RenderToResponseContext): Promise<Response> {
		const viewFn = view as (props: P) => EcoPagesElement;
		const content = viewFn(props);

		let body: string;
		if (ctx.partial) {
			body = content as string;
		} else {
			const Layout = resolveInnermostPageLayout(view.config?.layouts) as
				((props: { children: string }) => string) | undefined;
			const children = Layout ? Layout({ children: content as string }) : content;
			body = `<!DOCTYPE html><html><body>${children}</body></html>`;
		}

		const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
		if (ctx.headers) {
			for (const [key, value] of Object.entries(ctx.headers)) {
				headers.set(key, value);
			}
		}

		return new Response(body, {
			status: ctx.status ?? 200,
			headers,
		});
	}

	protected override async importPageFile(_file: string): Promise<EcoPageFile> {
		this.ImportedFiles.push(_file);
		if (!this.PageModule) throw new Error('Mock page module not set');
		return this.PageModule;
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		if (!this.HtmlTemplate) throw new Error('Mock HTML template not set');
		return this.HtmlTemplate;
	}

	protected override async resolveDependencies(
		_components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		return [];
	}

	public async testPrepareRenderOptions(options: RouteRendererOptions) {
		return this.prepareRenderOptions(options);
	}

	public testShouldDelegateForeignChild(input: { currentIntegration: string; targetIntegration?: string }) {
		return this.foreignSubtreeExecutionService.shouldDelegateForeignChild(input);
	}

	public testHasForeignChildDescendants(component: EcoComponent) {
		return this.hasForeignChildDescendants(component);
	}

	public async testGetHtmlTemplate() {
		return this.getHtmlTemplate();
	}

	public async testBaseGetHtmlTemplate() {
		return super.getHtmlTemplate();
	}

	public testGetRendererBootstrapDependencies(partial = false) {
		return this.getRendererBootstrapDependencies(partial);
	}

	public async testFinalizeDocumentShellHtml(options: {
		html: string;
		partial?: boolean;
		htmlContributions?: HtmlDocumentContribution[];
	}) {
		this.appendProcessedDependencies(this.getRendererBootstrapDependencies(options.partial));
		return finalizeDocumentShellHtml(this.htmlTransformer, {
			html: options.html,
			partial: options.partial,
			htmlContributions:
				options.htmlContributions ?? this.getHtmlDocumentContributions({ partial: options.partial ?? false }),
		});
	}

	public async testTransformRouteResponse(
		response: Response,
		htmlContributions?: HtmlDocumentContribution[],
		pagePackage?: PagePackageResult,
	) {
		const adapter = this.createRouteRenderOrchestratorAdapter();
		return adapter.transformRouteResponse(response, htmlContributions, pagePackage);
	}

	public appendTestProcessedDependencies(assets: ProcessedAsset[]) {
		return this.appendProcessedDependencies(assets);
	}

	public setTestPagePackage(pagePackage: PagePackageResult) {
		this.htmlTransformer.setPagePackage(pagePackage);
	}

	public getTestPagePackage() {
		return this.htmlTransformer.getPagePackage();
	}

	public getTestProcessedDependencies() {
		return this.htmlTransformer.getProcessedDependencies();
	}

	public async testRenderPartialViewResponse<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx?: RenderToResponseContext;
		renderInline?: () => Promise<BodyInit>;
		transformHtml?: (html: string) => string;
	}) {
		return this.renderPartialViewResponse({
			view: input.view,
			props: input.props,
			ctx: input.ctx ?? { partial: true },
			renderInline: input.renderInline,
			transformHtml: input.transformHtml,
		});
	}

	public async testRenderViewWithDocumentShell<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx?: RenderToResponseContext;
		layout?: EcoComponent;
	}) {
		return this.renderViewWithDocumentShell({
			view: input.view,
			props: input.props,
			ctx: input.ctx ?? {},
			layout: input.layout,
		});
	}

	public async testRenderForeignSubtree(input: ComponentRenderInput) {
		return toForeignSubtreeRenderPayload(await this.renderComponentWithForeignChildren(input));
	}

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ForeignChildRuntime {
		this.ForeignChildRuntimeCreationCount += 1;

		if (this.UseFailFastForeignChildRuntime) {
			return this.createFailFastForeignChildRuntime();
		}

		return super.createForeignChildRuntime(options);
	}

	protected override getHtmlDocumentContributions(_options?: {
		partial?: boolean;
	}): HtmlDocumentContribution[] | undefined {
		return this.HtmlContributions;
	}
}
