import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoFunctionComponent, EcoPageComponent } from '../../types/public-types.ts';
import type { ExplicitViewRenderer, ExplicitViewRendererResolver } from '../../route-renderer/route-renderer.ts';

type ExplicitStaticRenderPreparationResult = {
	renderer: ExplicitViewRenderer;
	props: Record<string, unknown>;
	view: EcoFunctionComponent<Record<string, unknown>, any>;
};

function getViewIntegrationName(view: {
	config?: { integration?: string; __eco?: { integration?: string } };
}): string | undefined {
	return view.config?.integration ?? view.config?.__eco?.integration;
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
	const integrationName = getViewIntegrationName(input.view);
	if (!integrationName) {
		throw new Error(input.errors.missingIntegration(input.routePath));
	}

	const renderer = input.routeRendererFactory.getExplicitViewRenderer(integrationName);
	if (!renderer) {
		throw new Error(input.errors.noRendererForIntegration(integrationName));
	}

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
		view: input.view as EcoFunctionComponent<Record<string, unknown>, any>,
	};
}
