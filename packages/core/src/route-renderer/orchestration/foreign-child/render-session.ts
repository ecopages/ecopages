import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/assets.types.ts';
import type { PagePackageResult } from '../../../types/public-types.ts';

/**
 * Mutable state for one route or view render.
 *
 * @remarks
 * Integration renderers are cached per Integration. This session keeps one
 * render's assets, integration dependencies, and foreign-renderer cache from
 * leaking into another render on the same instance.
 */
export type RenderSession = {
	processedDependencies: ProcessedAsset[];
	pagePackage?: PagePackageResult;
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererCache: Map<string, unknown>;
};

/**
 * Starts a render session from the integration dependencies active at render entry.
 */
export function createRenderSession(resolvedIntegrationDependencies: ProcessedAsset[] = []): RenderSession {
	return {
		processedDependencies: [],
		resolvedIntegrationDependencies: [...resolvedIntegrationDependencies],
		rendererCache: new Map(),
	};
}
