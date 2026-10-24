import type { ProcessedAsset } from '../../../assets/asset-processing-service/assets.types.ts';
import type { PageClientPlan } from '../ownership-graph/page-client-plan.ts';

/**
 * Mutable state for one route or view render.
 *
 * @remarks
 * Integration renderers are cached per Integration. This session keeps one
 * render's integration dependencies and foreign-renderer cache from leaking
 * into another render on the same instance.
 */
export type RenderSession = {
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererCache: Map<string, unknown>;
};

/** Renderer-owned state attached to an active Eco component render context. */
export type RouteRenderContextState = {
	pageClientPlan?: PageClientPlan;
	preparedGraphComponents?: ReadonlyMap<string, boolean>;
	session?: RenderSession;
};

/**
 * Starts a render session from the integration dependencies active at render entry.
 */
export function createRenderSession(resolvedIntegrationDependencies: ProcessedAsset[] = []): RenderSession {
	return {
		resolvedIntegrationDependencies: [...resolvedIntegrationDependencies],
		rendererCache: new Map(),
	};
}
