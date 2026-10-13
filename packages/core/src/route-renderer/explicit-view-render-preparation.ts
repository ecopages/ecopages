import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoFunctionComponent, EcoPageComponent } from '../types/public-types.ts';
import type { ExplicitViewRenderer, ExplicitViewRendererResolver } from './route-renderer.ts';

type ExplicitStaticRenderPreparationResult = {
	renderer: ExplicitViewRenderer;
	props: Record<string, unknown>;
	view: EcoFunctionComponent<Record<string, unknown>, any>;
};

function getViewIntegrationName(view: {
	config?: { integration?: string; identity?: { integration?: string } };
}): string | undefined {
	return view.config?.integration ?? view.config?.identity?.integration;
}

/**
 * Resolves the renderer for one explicit view without reading its static props.
 *
 * @remarks
 * Static export planning calls this so a dynamic route whose `staticProps`
 * reads params is not invoked before a slug exists.
 */
export function resolveExplicitViewRenderer(input: {
	routePath: string;
	view: EcoPageComponent<any>;
	routeRendererFactory: ExplicitViewRendererResolver;
	errors: {
		missingIntegration(routePath: string): string;
		noRendererForIntegration(integrationName: string): string;
	};
}): { renderer: ExplicitViewRenderer; view: EcoFunctionComponent<Record<string, unknown>, any> } {
	const integrationName = getViewIntegrationName(input.view);
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
 * Resolves the renderer and static props needed to render one explicit static
 * view at runtime or during static generation.
 */
export async function prepareExplicitStaticRender(input: {
	routePath: string;
	view: EcoPageComponent<any>;
	params: Record<string, string | string[]>;
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	routeRendererFactory: ExplicitViewRendererResolver;
	errors: {
		missingIntegration(routePath: string): string;
		noRendererForIntegration(integrationName: string): string;
	};
}): Promise<ExplicitStaticRenderPreparationResult> {
	const { renderer, view } = resolveExplicitViewRenderer(input);

	const props = input.view.staticProps
		? (
				await input.view.staticProps({
					pathname: { params: input.params },
					appConfig: input.appConfig,
					runtimeOrigin: input.runtimeOrigin,
				})
			).props
		: {};

	return {
		renderer,
		props,
		view,
	};
}
