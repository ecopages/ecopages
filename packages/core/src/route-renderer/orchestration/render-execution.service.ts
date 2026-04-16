import { inspectBoundaryArtifactHtml } from './render-output.utils.ts';
import type {
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';

export interface CapturedHtmlRenderResult {
	body: RouteRendererBody;
	html: string;
}

export interface FinalizeHtmlRenderOptions {
	html: string;
	componentRootAttributes?: Record<string, string>;
	documentAttributes?: Record<string, string>;
}

export interface RenderExecutionCallbacks<C> {
	prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions<C>>;
	render(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
	getDocumentAttributes(renderOptions: IntegrationRendererRenderOptions<C>): Record<string, string> | undefined;
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string;
	transformResponse(response: Response): Promise<RouteRendererBody>;
}

/**
 * Executes the main post-preparation rendering flow for integration renderers.
 *
 * This service owns the orchestration that happens after normalized render
 * options have been prepared: one render pass, unresolved boundary-marker
 * enforcement, root-attribute application, and final HTML transformation into
 * a response body stream.
 */
export class RenderExecutionService {
	async captureHtmlRender(render: () => Promise<RouteRendererBody>): Promise<CapturedHtmlRenderResult> {
		const renderedBody = await render();
		const capturedRender = await this.captureRenderedBody(renderedBody);

		return {
			body: capturedRender.body,
			html: capturedRender.html,
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
		callbacks: RenderExecutionCallbacks<C>,
	): Promise<RouteRenderResult> {
		const renderOptions = await callbacks.prepareRenderOptions(options);
		const shouldApplyComponentRootAttributes =
			renderOptions.componentRender?.canAttachAttributes &&
			renderOptions.componentRender.rootAttributes &&
			Object.keys(renderOptions.componentRender.rootAttributes).length > 0;

		const renderExecution = await this.captureHtmlRender(async () => callbacks.render(renderOptions));
		const boundaryArtifacts = inspectBoundaryArtifactHtml(renderExecution.html);
		const documentAttributes = callbacks.getDocumentAttributes(renderOptions);
		const hasBoundaryMarkerHtml = boundaryArtifacts.hasUnresolvedBoundaryArtifacts;

		if (hasBoundaryMarkerHtml) {
			throw new Error(
				'[ecopages] Route render returned unresolved boundary artifact HTML. Full-route unresolved-boundary fallback has been removed; resolve mixed boundaries inside renderComponentBoundary().',
			);
		}

		const canReuseCapturedBody =
			!hasBoundaryMarkerHtml &&
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

		const finalization = await this.finalizeHtmlRender(
			{
				html: boundaryArtifacts.normalizedHtml,
				componentRootAttributes: shouldApplyComponentRootAttributes
					? (renderOptions.componentRender?.rootAttributes as Record<string, string>)
					: undefined,
				documentAttributes,
			},
			{
				applyAttributesToHtmlElement: callbacks.applyAttributesToHtmlElement,
				applyAttributesToFirstBodyElement: callbacks.applyAttributesToFirstBodyElement,
			},
		);

		const body = await callbacks.transformResponse(
			new Response(finalization, {
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

	async finalizeHtmlRender(
		options: FinalizeHtmlRenderOptions,
		callbacks: Pick<
			RenderExecutionCallbacks<unknown>,
			'applyAttributesToHtmlElement' | 'applyAttributesToFirstBodyElement'
		>,
	): Promise<string> {
		return this.applyFinalHtmlAttributes(options.html, options, callbacks);
	}

	private applyFinalHtmlAttributes(
		html: string,
		options: FinalizeHtmlRenderOptions,
		callbacks: Pick<
			RenderExecutionCallbacks<unknown>,
			'applyAttributesToHtmlElement' | 'applyAttributesToFirstBodyElement'
		>,
	): string {
		let renderedHtml = html;

		if (options.componentRootAttributes && Object.keys(options.componentRootAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToFirstBodyElement(renderedHtml, options.componentRootAttributes);
		}

		if (options.documentAttributes && Object.keys(options.documentAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToHtmlElement(renderedHtml, options.documentAttributes);
		}

		return renderedHtml;
	}
}
