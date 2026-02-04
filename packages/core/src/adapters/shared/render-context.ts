import type { EcoComponent, RenderContext, RenderOptions, ResponseOptions } from '../../public-types.ts';
import type { IntegrationRenderer, RenderToResponseContext } from '../../route-renderer/integration-renderer.ts';
import type { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import { invariant } from '../../utils/invariant.ts';

export interface CreateRenderContextOptions {
	integrations: IntegrationPlugin[];
}

/**
 * Merges request locals into component props as a dedicated 'locals' property.
 * This prevents naming conflicts and maintains type safety by keeping locals
 * separate from other props.
 *
 * @param props - The original component props
 * @param locals - Optional request-scoped locals from middleware
 * @returns Props with locals merged in, or original props if no locals provided
 */
function mergePropsWithLocals<P>(props: P, locals: Record<string, unknown> | undefined): P {
	if (!locals || typeof props !== 'object' || props === null) {
		return props;
	}
	return { ...(props as Record<string, unknown>), locals } as P;
}

/**
 * Creates a render context for route handlers.
 * Provides render(), renderPartial(), json(), and html() methods that can be used
 * within route handlers to generate responses.
 *
 * @param options - Configuration options including available integrations
 * @returns A RenderContext object with methods for rendering views and creating responses
 */
export function createRenderContext(options: CreateRenderContextOptions): RenderContext {
	const { integrations } = options;

	/**
	 * Resolves the appropriate renderer for a given view component based on its integration.
	 * Throws an error if the integration cannot be determined or is not found.
	 */
	const getRendererForView = <P>(view: EcoComponent<P>): IntegrationRenderer => {
		const integrationName = view.config?.__eco?.integration;
		invariant(
			!!integrationName,
			'Cannot determine integration for view. Ensure the view is defined with eco.page() in a file with a recognized extension.',
		);

		const integration = integrations.find((i) => i.name === integrationName);
		invariant(!!integration, `No integration found for: ${integrationName}`);

		return integration.initializeRenderer();
	};

	return {
		async render<P>(view: EcoComponent<P>, props: P, renderOptions?: RenderOptions): Promise<Response> {
			const locals = (this as { locals?: Record<string, unknown> } | undefined)?.locals;
			const mergedProps = mergePropsWithLocals(props, locals);

			const renderer = getRendererForView(view);
			const ctx: RenderToResponseContext = {
				partial: false,
				status: renderOptions?.status,
				headers: renderOptions?.headers,
			};
			return renderer.renderToResponse(view, mergedProps, ctx);
		},

		async renderPartial<P>(view: EcoComponent<P>, props: P, renderOptions?: RenderOptions): Promise<Response> {
			const locals = (this as { locals?: Record<string, unknown> } | undefined)?.locals;
			const mergedProps = mergePropsWithLocals(props, locals);

			const renderer = getRendererForView(view);
			const ctx: RenderToResponseContext = {
				partial: true,
				status: renderOptions?.status,
				headers: renderOptions?.headers,
			};
			return renderer.renderToResponse(view, mergedProps, ctx);
		},

		json(data: unknown, responseOptions?: ResponseOptions): Response {
			const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
			if (responseOptions?.headers) {
				const incomingHeaders = new Headers(responseOptions.headers);
				incomingHeaders.forEach((value, key) => headers.set(key, value));
			}
			return new Response(JSON.stringify(data), {
				status: responseOptions?.status ?? 200,
				headers,
			});
		},

		html(content: string, responseOptions?: ResponseOptions): Response {
			const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
			if (responseOptions?.headers) {
				const incomingHeaders = new Headers(responseOptions.headers);
				incomingHeaders.forEach((value, key) => headers.set(key, value));
			}
			return new Response(content, {
				status: responseOptions?.status ?? 200,
				headers,
			});
		},
	};
}
