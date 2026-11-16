import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { getComponentOwner } from '../eco/component-identity.ts';
import { isDynamicPage } from '../eco/page-data-hooks.ts';
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
 * Fails for a view that a render without a request cannot serve: one that declares `middleware`, or a Dynamic Page
 * that declares `props`.
 *
 * @remarks
 * `app.static()`, error pages and static generation render a view with no request, so no middleware runs, its
 * layout factories receive no locals, and a Dynamic Page's `props` hook, which is a request handler, cannot run.
 * Ignoring the list would serve the view unguarded while its types promise the locals the guard provides, and a
 * skipped Dynamic Page would build and then fail on every request. Static generation calls this before it skips a
 * Dynamic Page, so both fail the build. `view` is `EcoPageComponent<any>` for the reason given on
 * `readViewPropsWithoutRequest`: a View loader erases the props type.
 * @throws When the view declares a non-empty `middleware` list, or has `cache: 'dynamic'` and `props`, naming the
 * route and the view's file.
 */
export function assertViewRendersWithoutRequest(routePath: string, view: EcoPageComponent<any>): void {
	const name = view.config?.identity?.file ?? 'its view';
	if (view.middleware?.length) {
		throw new Error(
			`[ecopages] ${routePath} renders ${name} without a request, so it cannot declare middleware: no middleware would run and the view would be served unguarded. Serve it from the pages directory, or render it from a route handler with ctx.render and give the handler the middleware.`,
		);
	}
	if (isDynamicPage(view) && view.props) {
		throw new Error(
			`[ecopages] ${routePath} renders ${name} without a request, so a view with cache: 'dynamic' cannot declare props. Serve it from the pages directory, or render it from a route handler with the props it needs.`,
		);
	}
}

/**
 * Resolves the renderer for one explicit view without reading its `props` hook.
 *
 * @remarks
 * Static export planning calls this so a dynamic route whose `props`
 * reads params is not invoked before a slug exists.
 */
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
	assertViewRendersWithoutRequest(input.routePath, input.view);
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
 * A Dynamic Page view still renders per request through `app.static()`, with no `props`: {@link
 * assertViewRendersWithoutRequest} has already rejected one that declares them.
 *
 * `view` is `EcoPageComponent<any>` because a View loader erases the props type: that member of the union is not
 * assignable to `EcoPageComponent<unknown>` or `EcoPageComponent<Record<string, unknown>>`, so a narrower type
 * would reject every loaded view. The hook's result is returned as the props the renderer passes back to it.
 */
function readViewPropsWithoutRequest(input: {
	view: EcoPageComponent<any>;
	params: Record<string, string | string[]>;
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
}): Record<string, unknown> | Promise<Record<string, unknown>> {
	const { view } = input;
	if (isDynamicPage(view) || !view.props) {
		return {};
	}
	return view.props({ params: input.params, appConfig: input.appConfig, runtimeOrigin: input.runtimeOrigin });
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
