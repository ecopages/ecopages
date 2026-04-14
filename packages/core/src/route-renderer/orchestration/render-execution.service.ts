import {
	runWithComponentRenderContext,
	type ComponentRenderBoundaryContext,
} from './component-render-context.ts';
import type {
	EcoComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { MarkerGraphContext } from '../component-graph/marker-graph-resolver.ts';

/**
 * Serializable graph context merged from render-time captured references and
 * optional explicit page-module graph metadata.
 */
export type RenderExecutionGraphContext = {
	propsByRef?: Record<string, Record<string, unknown>>;
	slotChildrenByRef?: MarkerGraphContext['slotChildrenByRef'];
};

export interface CapturedHtmlRenderResult {
	body: RouteRendererBody;
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
	serializeDeferredValue?: (
		value: unknown,
		serializeValue: (value: unknown) => string | undefined,
	) => string | undefined;
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
	transformResponse(response: Response): Promise<RouteRendererBody>;
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

function decodeHtmlEntities(value: string): string {
	let decoded = value;
	let previous: string | undefined;

	do {
		previous = decoded;
		decoded = decoded
			.replaceAll('&quot;', '"')
			.replaceAll('&#39;', "'")
			.replaceAll('&#x27;', "'")
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&amp;', '&');
	} while (decoded !== previous);

	return decoded;
}

function restoreEscapedComponentMarkers(html: string): string {
	return html.replace(
		/&(?:amp;)?lt;eco-marker\b[\s\S]*?&(?:amp;)?gt;&(?:amp;)?lt;\/eco-marker&(?:amp;)?gt;/g,
		(marker) => decodeHtmlEntities(marker),
	);
}

const MAX_MARKER_RESOLUTION_PASSES = 10;

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
		serializeDeferredValue:
			| ((value: unknown, serializeValue: (value: unknown) => string | undefined) => string | undefined)
			| undefined,
		render: () => Promise<RouteRendererBody>,
	): Promise<CapturedHtmlRenderResult> {
		const renderExecution = await runWithComponentRenderContext(
			{
				currentIntegration: currentIntegrationName,
				boundaryContext,
				serializeDeferredValue,
			},
			async () => {
				const renderedBody = await render();
				return await this.captureRenderedBody(renderedBody);
			},
		);

		return {
			body: renderExecution.value.body,
			html: renderExecution.value.html,
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
			callbacks.serializeDeferredValue,
			async () => callbacks.render(renderOptions),
		);
		const normalizedCapturedHtml = restoreEscapedComponentMarkers(renderExecution.html);
		const documentAttributes = callbacks.getDocumentAttributes(renderOptions);
		const canReuseCapturedBody =
			!normalizedCapturedHtml.includes('<eco-marker') &&
			!shouldApplyComponentRootAttributes &&
			!(documentAttributes && Object.keys(documentAttributes).length > 0);

		if (canReuseCapturedBody) {
			const body = await callbacks.transformResponse(
				new Response(renderExecution.body as BodyInit, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
			);

			return {
				body,
				cacheStrategy: renderOptions.cacheStrategy,
			};
		}

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
				html: normalizedCapturedHtml,
				graphContext: componentGraphContext,
				componentsToResolve: this.getComponentsToResolve(renderOptions),
				componentRootAttributes: shouldApplyComponentRootAttributes
					? (renderOptions.componentRender?.rootAttributes as Record<string, string>)
					: undefined,
				documentAttributes,
				mergeAssets: true,
			},
			callbacks,
		);

		const body = await callbacks.transformResponse(
			new Response(finalization.html, {
				headers: {
					'Content-Type': 'text/html',
				},
			}),
		);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
		};
	}

	private async captureRenderedBody(body: RouteRendererBody): Promise<{ body: RouteRendererBody; html: string }> {
		const response = new Response(body as BodyInit);

		if (typeof body === 'string') {
			return {
				body,
				html: await response.text(),
			};
		}

		if (!response.body) {
			return {
				body,
				html: await response.text(),
			};
		}

		const [capturedBody, replayBody] = response.body.tee();

		return {
			body: replayBody,
			html: await new Response(capturedBody).text(),
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
		let renderedHtml = restoreEscapedComponentMarkers(options.html);
		let markerAssets: ProcessedAsset[] = [];

		for (let pass = 0; pass < MAX_MARKER_RESOLUTION_PASSES; pass += 1) {
			if (!renderedHtml.includes('<eco-marker')) {
				break;
			}

			const markerResolution = await callbacks.resolveMarkerGraphHtml({
				html: renderedHtml,
				componentsToResolve: options.componentsToResolve,
				graphContext: options.graphContext,
			});
			const resolvedHtml = restoreEscapedComponentMarkers(markerResolution.html);
			markerAssets = callbacks.dedupeProcessedAssets([...markerAssets, ...markerResolution.assets]);

			if (options.mergeAssets !== false && markerResolution.assets.length > 0) {
				const mergedDependencies = callbacks.dedupeProcessedAssets([
					...callbacks.getProcessedDependencies(),
					...markerResolution.assets,
				]);
				callbacks.setProcessedDependencies(mergedDependencies);
			}

			if (resolvedHtml === renderedHtml) {
				renderedHtml = resolvedHtml;
				break;
			}

			renderedHtml = resolvedHtml;
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
