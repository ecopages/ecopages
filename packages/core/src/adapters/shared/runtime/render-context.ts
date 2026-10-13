import { fileURLToPath } from 'node:url';
import type {
	EcoComponent,
	EcoPageComponent,
	RenderContext,
	RenderOptions,
	ResponseOptions,
} from '../../../types/public-types.ts';
import type {
	ExplicitViewRenderContext,
	IntegrationRenderer,
} from '../../../route-renderer/orchestration/integration-renderer.ts';
import type { AnyIntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import { invariant } from '../../../utils/invariant.ts';
import { createBodyResponse } from '../http/create-body-response.ts';

export interface CreateRenderContextOptions {
	integrations: AnyIntegrationPlugin[];
	importServerModule?: (filePath: string) => Promise<unknown>;
}

function resolveServerModulePath(filePath: string | URL): string {
	return filePath instanceof URL ? fileURLToPath(filePath) : filePath;
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
 * Request data the handler context carries into an explicit view render.
 *
 * @remarks
 * The render methods are spread onto the handler context, so `this` holds the request, its route
 * params, and its locals.
 */
type HandlerRequestScope = {
	locals?: Record<string, unknown>;
	params?: Record<string, string | string[]>;
	request?: Request;
};

function createExplicitViewContext(
	scope: HandlerRequestScope | undefined,
	renderOptions: RenderOptions | undefined,
	partial: boolean,
): ExplicitViewRenderContext {
	return {
		partial,
		status: renderOptions?.status,
		headers: renderOptions?.headers,
		locals: scope?.locals as ExplicitViewRenderContext['locals'],
		params: scope?.params,
		query: scope?.request ? Object.fromEntries(new URL(scope.request.url).searchParams) : undefined,
	};
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
		const integrationName = view.config?.integration ?? view.config?.identity?.integration;
		invariant(
			!!integrationName,
			'Cannot determine integration for view. Set view.config.integration explicitly or ensure the view is defined with eco.page() in a file with a recognized extension.',
		);

		const integration = integrations.find((i) => i.name === integrationName);
		invariant(!!integration, `No integration found for: ${integrationName}`);

		return integration.initializeRenderer() as IntegrationRenderer;
	};

	const renderContext: RenderContext = {
		importServerModule: async <T = unknown>(filePath: string | URL) => {
			invariant(!!options.importServerModule, 'Server module importing is not available in this render context.');
			return (await options.importServerModule(resolveServerModulePath(filePath))) as T;
		},

		async renderServerModule<P = Record<string, unknown>>(
			this: HandlerRequestScope | undefined,
			filePath: string | URL,
			props?: P,
			renderOptions?: RenderOptions,
		): Promise<Response> {
			const module = await renderContext.importServerModule<{ default: EcoPageComponent<P> }>(filePath);
			const view = module.default as EcoComponent<P>;
			const locals = this?.locals;
			const mergedProps = mergePropsWithLocals<P>(props ?? ({} as P), locals);

			const renderer = getRendererForView(view);
			return await renderer.renderExplicitView(
				view,
				mergedProps,
				createExplicitViewContext(this, renderOptions, false),
			);
		},

		async render<P>(
			this: HandlerRequestScope | undefined,
			view: EcoComponent<P>,
			props?: P,
			renderOptions?: RenderOptions,
		): Promise<Response> {
			const locals = this?.locals;
			const mergedProps = mergePropsWithLocals<P>(props ?? ({} as P), locals);

			const renderer = getRendererForView(view);
			return renderer.renderExplicitView(
				view,
				mergedProps,
				createExplicitViewContext(this, renderOptions, false),
			);
		},

		async renderPartial<P>(
			this: HandlerRequestScope | undefined,
			view: EcoComponent<P>,
			props: P,
			renderOptions?: RenderOptions,
		): Promise<Response> {
			const locals = this?.locals;
			const mergedProps = mergePropsWithLocals<P>(props, locals);

			const renderer = getRendererForView(view);
			return renderer.renderExplicitView(view, mergedProps, createExplicitViewContext(this, renderOptions, true));
		},

		json(data: unknown, responseOptions?: ResponseOptions): Response {
			return createBodyResponse('json', data, {
				status: responseOptions?.status,
				headers: responseOptions?.headers,
			});
		},

		html(content: string, responseOptions?: ResponseOptions): Response {
			return createBodyResponse('html', content, {
				status: responseOptions?.status,
				headers: responseOptions?.headers,
			});
		},
	};

	return renderContext;
}
