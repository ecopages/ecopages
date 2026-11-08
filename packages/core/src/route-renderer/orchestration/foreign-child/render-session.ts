import type { PageClientPlan } from '../ownership-graph/page-client-plan.ts';

/**
 * Mutable state for one route or view render.
 *
 * @remarks
 * Integration renderers are cached per Integration. This session keeps one
 * render's foreign-renderer cache from leaking into another render on the same
 * instance.
 */
export type RenderSession = {
	rendererCache: Map<string, unknown>;
};

/** Renderer-owned state attached to an active Eco component render context. */
export type RouteRenderContextState = {
	pageClientPlan?: PageClientPlan;
	preparedGraphComponents?: ReadonlyMap<string, boolean>;
	session?: RenderSession;
};

/** Starts an empty render session. */
export function createRenderSession(): RenderSession {
	return {
		rendererCache: new Map(),
	};
}
