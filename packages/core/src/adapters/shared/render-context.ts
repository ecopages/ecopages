import type { EcoComponent, RenderContext, RenderOptions, ResponseOptions } from '../../public-types.ts';
import type { IntegrationRenderer, RenderToResponseContext } from '../../route-renderer/integration-renderer.ts';
import type { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import { invariant } from '../../utils/invariant.ts';

export interface CreateRenderContextOptions {
	integrations: IntegrationPlugin[];
}

/**
 * Creates a render context for route handlers.
 * Provides render(), renderPartial(), json(), and html() methods.
 */
export function createRenderContext(options: CreateRenderContextOptions): RenderContext {
	const { integrations } = options;

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
			const renderer = getRendererForView(view);
			const ctx: RenderToResponseContext = {
				partial: false,
				status: renderOptions?.status,
				headers: renderOptions?.headers,
			};
			return renderer.renderToResponse(view, props, ctx);
		},

		async renderPartial<P>(view: EcoComponent<P>, props: P, renderOptions?: RenderOptions): Promise<Response> {
			const renderer = getRendererForView(view);
			const ctx: RenderToResponseContext = {
				partial: true,
				status: renderOptions?.status,
				headers: renderOptions?.headers,
			};
			return renderer.renderToResponse(view, props, ctx);
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
