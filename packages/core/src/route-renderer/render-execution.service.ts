import { runWithComponentRenderContext, type ComponentRenderBoundaryContext } from '../eco/component-render-context.ts';
import type {
	EcoComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../public-types.ts';
import type { ProcessedAsset } from '../services/asset-processing-service/index.ts';
import type { MarkerGraphContext } from './marker-graph-resolver.ts';

/**
 * Serializable graph context merged from render-time captured references and
 * optional explicit page-module graph metadata.
 */
export type RenderExecutionGraphContext = {
	propsByRef?: Record<string, Record<string, unknown>>;
	slotChildrenByRef?: MarkerGraphContext['slotChildrenByRef'];
};

export interface CapturedHtmlRenderResult {
	html: string;
	graphContext: RenderExecutionGraphContext;
}

export interface FinalizeHtmlRenderOptions {
	html: string;
	graphContext: RenderExecutionGraphContext;
	componentsToResolve: EcoComponent[];
	componentRootAttributes?: Record<string, string>;
	documentAttributes?: Record<string, string>;
	mergeAssets?: boolean;
}

export interface RenderExecutionCallbacks<C> {
	prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions<C>>;
	render(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
	getComponentRenderBoundaryContext(): ComponentRenderBoundaryContext;
	getDocumentAttributes(renderOptions: IntegrationRendererRenderOptions<C>): Record<string, string> | undefined;
	resolveMarkerGraphHtml(input: {
		html: string;
		componentsToResolve: EcoComponent[];
		graphContext: RenderExecutionGraphContext;
	}): Promise<{ html: string; assets: ProcessedAsset[] }>;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
	getProcessedDependencies(): ProcessedAsset[];
	setProcessedDependencies(dependencies: ProcessedAsset[]): void;
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string;
	transformHtml(html: string): Promise<RouteRendererBody>;
}

export interface FinalizeHtmlRenderCallbacks {
	resolveMarkerGraphHtml(input: {
		html: string;
		componentsToResolve: EcoComponent[];
		graphContext: RenderExecutionGraphContext;
	}): Promise<{ html: string; assets: ProcessedAsset[] }>;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
	getProcessedDependencies(): ProcessedAsset[];
	setProcessedDependencies(dependencies: ProcessedAsset[]): void;
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string;
}

/**
 * Executes the main post-preparation rendering flow for integration renderers.
 *
 * This service owns the orchestration that happens after normalized render
 * options have been prepared: the first render pass, graph-context capture,
 * deferred marker resolution, root-attribute application, and final HTML
 * transformation into a response body stream.
 */
export class RenderExecutionService {
	async captureHtmlRender(
		currentIntegrationName: string,
		boundaryContext: ComponentRenderBoundaryContext,
		render: () => Promise<RouteRendererBody>,
	): Promise<CapturedHtmlRenderResult> {
		const renderExecution = await runWithComponentRenderContext(
			{
				currentIntegration: currentIntegrationName,
				boundaryContext,
			},
			render,
		);

		return {
			html: await new Response(renderExecution.value as BodyInit).text(),
			graphContext: renderExecution.graphContext,
		};
	}

	/**
	 * Executes one integration render pass and returns the final route render
	 * result.
	 *
	 * @typeParam C Integration render output element type.
	 * @param options Route-level render options.
	 * @param currentIntegrationName Active integration name for this render pass.
	 * @param callbacks Renderer-specific hooks required during execution.
	 * @returns Final route render output with body and cache strategy.
	 */
	async execute<C = unknown>(
		options: RouteRendererOptions,
		currentIntegrationName: string,
		callbacks: RenderExecutionCallbacks<C>,
	): Promise<RouteRenderResult> {
		const renderOptions = await callbacks.prepareRenderOptions(options);
		const shouldApplyComponentRootAttributes =
			renderOptions.componentRender?.canAttachAttributes &&
			renderOptions.componentRender.rootAttributes &&
			Object.keys(renderOptions.componentRender.rootAttributes).length > 0;

		const renderExecution = await this.captureHtmlRender(
			currentIntegrationName,
			callbacks.getComponentRenderBoundaryContext(),
			async () => callbacks.render(renderOptions),
		);

		const componentGraphContext = this.mergeGraphContext(
			renderExecution.graphContext,
			(
				renderOptions as IntegrationRendererRenderOptions<C> & {
					componentGraphContext?: RenderExecutionGraphContext;
				}
			).componentGraphContext,
		);
		const finalization = await this.finalizeHtmlRender(
			{
				html: renderExecution.html,
				graphContext: componentGraphContext,
				componentsToResolve: this.getComponentsToResolve(renderOptions),
				componentRootAttributes: shouldApplyComponentRootAttributes
					? (renderOptions.componentRender?.rootAttributes as Record<string, string>)
					: undefined,
				documentAttributes: callbacks.getDocumentAttributes(renderOptions),
				mergeAssets: true,
			},
			callbacks,
		);

		const body = await callbacks.transformHtml(finalization.html);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
		};
	}

	/**
	 * Merges captured render-time graph references with any explicit graph context
	 * provided by the page module.
	 *
	 * @param capturedGraphContext Graph context captured from the first render pass.
	 * @param explicitGraphContext Optional page-module graph metadata.
	 * @returns Merged graph context used during marker resolution.
	 */
	mergeGraphContext(
		capturedGraphContext: RenderExecutionGraphContext,
		explicitGraphContext?: RenderExecutionGraphContext,
	): RenderExecutionGraphContext {
		return {
			propsByRef: {
				...(capturedGraphContext.propsByRef ?? {}),
				...(explicitGraphContext?.propsByRef ?? {}),
			},
			slotChildrenByRef: {
				...(capturedGraphContext.slotChildrenByRef ?? {}),
				...(explicitGraphContext?.slotChildrenByRef ?? {}),
			},
		};
	}

	async finalizeHtmlRender(
		options: FinalizeHtmlRenderOptions,
		callbacks: FinalizeHtmlRenderCallbacks,
	): Promise<{ html: string; assets: ProcessedAsset[] }> {
		let renderedHtml = options.html;
		let markerAssets: ProcessedAsset[] = [];

		if (renderedHtml.includes('<eco-marker')) {
			const markerResolution = await callbacks.resolveMarkerGraphHtml({
				html: renderedHtml,
				componentsToResolve: options.componentsToResolve,
				graphContext: options.graphContext,
			});
			renderedHtml = markerResolution.html;
			markerAssets = markerResolution.assets;

			if (options.mergeAssets !== false && markerResolution.assets.length > 0) {
				const mergedDependencies = callbacks.dedupeProcessedAssets([
					...callbacks.getProcessedDependencies(),
					...markerResolution.assets,
				]);
				callbacks.setProcessedDependencies(mergedDependencies);
			}
		}

		if (options.componentRootAttributes && Object.keys(options.componentRootAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToFirstBodyElement(renderedHtml, options.componentRootAttributes);
		}

		if (options.documentAttributes && Object.keys(options.documentAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToHtmlElement(renderedHtml, options.documentAttributes);
		}

		return {
			html: renderedHtml,
			assets: markerAssets,
		};
	}

	/**
	 * Returns the component set that participates in marker graph resolution for a
	 * render pass.
	 *
	 * @typeParam C Integration render output element type.
	 * @param renderOptions Normalized render options for the pass.
	 * @returns Ordered component list for graph registry construction.
	 */
	private getComponentsToResolve<C>(renderOptions: IntegrationRendererRenderOptions<C>): EcoComponent[] {
		return renderOptions.Layout
			? [renderOptions.HtmlTemplate as EcoComponent, renderOptions.Layout as EcoComponent, renderOptions.Page]
			: [renderOptions.HtmlTemplate as EcoComponent, renderOptions.Page];
	}
}
