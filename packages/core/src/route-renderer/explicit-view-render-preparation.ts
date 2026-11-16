import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { getComponentOwner } from '../eco/component-identity.ts';
import { ensureIntegrationRuntimeReady } from '../build/app-build-manifest-runtime.ts';
import type { EcoFunctionComponent, EcoPageComponent } from '../types/contracts.ts';
import { assertViewDeclaredIn } from './page-declaration.ts';
import type { ExplicitViewRenderer, ExplicitViewRendererResolver } from './route-renderer.ts';

type ExplicitStaticRenderPreparationResult = {
	renderer: ExplicitViewRenderer;
	props: Record<string, unknown>;
	view: EcoFunctionComponent<Record<string, unknown>, any>;
};

/**
 * Resolves the renderer for one explicit view without reading its `props` hook.
 *
 * @remarks
 * Static export planning calls this so a dynamic route whose `props`
 * reads params is not invoked before a slug exists.
 */
/**
 * Fails for a view that declares `middleware`, which a render without a request cannot run.
 *
 * @remarks
 * `app.static()`, error pages and static generation render a view with no request, so no middleware runs and its
 * layout factories receive no locals. Ignoring the list would serve the view unguarded while its types promise the
 * locals the guard provides.
 * @throws When the view declares a non-empty `middleware` list, naming the route and the view's file.
 */
export function assertViewWithoutMiddleware(
	routePath: string,
	view: {
		readonly middleware?: readonly unknown[];
		readonly config?: { readonly identity?: { readonly file: string } };
	},
): void {
	if (!view.middleware?.length) return;
	const name = view.config?.identity?.file ?? 'its view';
	throw new Error(
		`[ecopages] ${routePath} renders ${name} without a request, so it cannot declare middleware: no middleware would run and the view would be served unguarded. Serve it from the pages directory, or render it from a route handler with ctx.render and give the handler the middleware.`,
	);
}

export function resolveExplicitViewRenderer(input: {
	routePath: string;
	view: EcoPageComponent<any>;
	/** Source file the view was loaded from and the app root, when known; the view must declare its Page there. */
	declaredIn?: { file: string; rootDir: string };
	routeRendererFactory: ExplicitViewRendererResolver;
	errors: {
		missingIntegration(routePath: string): string;
		noRendererForIntegration(integrationName: string): string;
	};
}): { renderer: ExplicitViewRenderer; view: EcoFunctionComponent<Record<string, unknown>, any> } {
	if (input.declaredIn) assertViewDeclaredIn(input.declaredIn.file, input.view, input.declaredIn.rootDir);
	assertViewWithoutMiddleware(input.routePath, input.view);
	const integrationName = getComponentOwner(input.view);
	if (!integrationName) {
		throw new Error(input.errors.missingIntegration(input.routePath));
	}

	const renderer = input.routeRendererFactory.getExplicitViewRenderer(integrationName);
	if (!renderer) {
		throw new Error(input.errors.noRendererForIntegration(integrationName));
	}

	return {
		renderer,
		view: input.view as EcoFunctionComponent<Record<string, unknown>, any>,
	};
}

/**
 * Runs the `props` hook of a view rendered without a request, with the build context.
 *
 * @remarks
 * A Dynamic Page view still renders per request through `app.static()`, but its `props` hook is a request handler
 * and this render has no request, so such a view must not declare one.
 *
 * `view` is `EcoPageComponent<any>` because a View loader erases the props type: that member of the union is not
 * assignable to `EcoPageComponent<unknown>` or `EcoPageComponent<Record<string, unknown>>`, so a narrower type
 * would reject every loaded view. The hook's result is returned as the props the renderer passes back to it.
 * @throws When a Dynamic Page view declares `props`.
 */
function readViewPropsWithoutRequest(input: {
	routePath: string;
	view: EcoPageComponent<any>;
	params: Record<string, string | string[]>;
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
}): Record<string, unknown> | Promise<Record<string, unknown>> {
	const { view } = input;
	if (view.cache === 'dynamic') {
		if (view.props) {
			throw new Error(
				`[ecopages] ${input.routePath} renders its view without a request, so a view with cache: 'dynamic' cannot declare props. Serve it from the pages directory, or render it from a route handler with the props it needs.`,
			);
		}
		return {};
	}
	return view.props
		? view.props({ params: input.params, appConfig: input.appConfig, runtimeOrigin: input.runtimeOrigin })
		: {};
}

/**
 * Resolves the renderer and props needed to render one explicit static
 * view at runtime or during static generation.
 *
 * @remarks
 * No request exists here, so the view's `props` hook receives the build context.
 */
export async function prepareExplicitStaticRender(input: {
	routePath: string;
	view: EcoPageComponent<any>;
	/** Source file the view was loaded from, when known. */
	viewFile?: string;
	params: Record<string, string | string[]>;
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	routeRendererFactory: ExplicitViewRendererResolver;
	errors: {
		missingIntegration(routePath: string): string;
		noRendererForIntegration(integrationName: string): string;
	};
}): Promise<ExplicitStaticRenderPreparationResult> {
	const integrationName = getComponentOwner(input.view);
	if (integrationName && input.appConfig.appRuntime?.integrationActivations) {
		await ensureIntegrationRuntimeReady({
			appConfig: input.appConfig,
			integrationName,
		});
	}
	const { renderer, view } = resolveExplicitViewRenderer({
		...input,
		declaredIn: input.viewFile ? { file: input.viewFile, rootDir: input.appConfig.rootDir } : undefined,
	});

	const props = await readViewPropsWithoutRequest(input);

	return {
		renderer,
		props,
		view,
	};
}
