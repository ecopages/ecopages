import { assertViewDeclaredIn } from '../../../route-renderer/page-declaration.ts';
import type { EcoComponent, RenderContext, RenderOptions } from '../../../types/contracts.ts';
import { isViewReference, type ViewReference } from '../../../types/view-reference.ts';
import { getComponentOwner } from '../../../eco/component-identity.ts';
import type {
	ExplicitViewRenderContext,
	IntegrationRenderer,
} from '../../../route-renderer/orchestration/integration-renderer.ts';
import type { AnyIntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import { invariant } from '../../../utils/invariant.ts';
import { createBodyResponse } from '../http/create-body-response.ts';

export interface CreateRenderContextOptions {
	integrations: AnyIntegrationPlugin[];
	ensureIntegrationReady?: (integrationName: string) => Promise<void>;
	importServerModule?: (filePath: string) => Promise<unknown>;
	/** App root; with it, an imported view must declare its Page with a literal `eco.page()` call in its own file. */
	rootDir?: string;
}

/**
 * Request data the handler context carries into an explicit view render.
 *
 * @remarks
 * The render methods are spread onto the handler context, so `this` holds the request, its route
 * params, and its locals. The view receives only the props the handler passes; `locals` reach its layout entries'
 * `props` factories alone.
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
		locals: scope?.locals,
		params: scope?.params,
		query: scope?.request ? Object.fromEntries(new URL(scope.request.url).searchParams) : undefined,
	};
}

/**
 * Creates a render context for route handlers.
 * Provides render(), renderPartial(), json(), and html() methods that can be used
 * within route handlers to generate responses. Imported views resolve through
 * `importServerModule` so development invalidation and the production map apply.
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
	const getRendererForView = async <P>(view: EcoComponent<P>): Promise<IntegrationRenderer> => {
		const integrationName = getComponentOwner(view);
		invariant(
			!!integrationName,
			'Cannot determine integration for view. Set view.config.integration explicitly or ensure the view is defined with eco.page() in a file with a recognized extension.',
		);

		const integration = integrations.find((i) => i.name === integrationName);
		invariant(!!integration, `No integration found for: ${integrationName}`);

		await options.ensureIntegrationReady?.(integrationName);
		return integration.getRenderer() as IntegrationRenderer;
	};

	const resolveView = async <P>(view: EcoComponent<P> | ViewReference<P>): Promise<EcoComponent<P>> => {
		if (!isViewReference<P>(view)) {
			return view;
		}

		invariant(!!options.importServerModule, 'Imported views need the server-module loader.');
		const module = (await options.importServerModule(view.filePath)) as { default?: EcoComponent<P> };
		invariant(!!module.default, `View module ${view.filePath} has no default export.`);
		if (options.rootDir) {
			assertViewDeclaredIn(view.filePath, module.default, options.rootDir);
		}
		return module.default;
	};

	const renderContext: RenderContext = {
		async render<P>(
			this: HandlerRequestScope | undefined,
			view: EcoComponent<P> | ViewReference<P>,
			props?: P,
			renderOptions?: RenderOptions,
		): Promise<Response> {
			const resolvedView = await resolveView(view);

			const renderer = await getRendererForView(resolvedView);
			return renderer.renderExplicitView(
				resolvedView,
				props ?? ({} as P),
				createExplicitViewContext(this, renderOptions, false),
			);
		},

		async renderPartial<P>(
			this: HandlerRequestScope | undefined,
			view: EcoComponent<P> | ViewReference<P>,
			props: P,
			renderOptions?: RenderOptions,
		): Promise<Response> {
			const resolvedView = await resolveView(view);

			const renderer = await getRendererForView(resolvedView);
			return renderer.renderExplicitView(
				resolvedView,
				props,
				createExplicitViewContext(this, renderOptions, true),
			);
		},

		json(data: unknown, responseOptions?: RenderOptions): Response {
			return createBodyResponse('json', data, {
				status: responseOptions?.status,
				headers: responseOptions?.headers,
			});
		},

		html(content: string, responseOptions?: RenderOptions): Response {
			return createBodyResponse('html', content, {
				status: responseOptions?.status,
				headers: responseOptions?.headers,
			});
		},
	};

	return renderContext;
}
