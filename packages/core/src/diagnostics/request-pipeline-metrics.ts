/**
 * Per-request and process-wide counters for the development render pipeline.
 *
 * @remarks
 * Gated behind {@link isRequestPipelineMetricsEnabled} so production paths stay quiet.
 * Benchmarks and structural invariant tests read the snapshot via
 * {@link getRequestPipelineMetricsSnapshot}.
 */

export type PageModuleLoadOutcome =
	'import-cache-hit' | 'disk-cache-hit' | 'cold-build' | 'host-loader' | 'unified-graph';

export type RouteRenderPhase =
	| 'resolve-route-inputs'
	| 'ownership-validation'
	| 'resolve-dependencies'
	| 'page-browser-graph'
	| 'render-body'
	| 'transform-response';

export type RouteRenderPhaseRecord = {
	count: number;
	totalDurationMs: number;
	lastDurationMs: number;
};

export type RequestPipelineMetricsSnapshot = {
	runtime: 'node' | 'bun';
	pageModuleLoads: number;
	pageModuleBuilds: number;
	pageModuleCacheHits: number;
	hostLoaderLoads: number;
	diskCacheHits: number;
	routeModuleArtifacts: number;
	mdxTransforms: number;
	collectionBuilds: number;
	routeRenderPhases: Partial<Record<RouteRenderPhase, RouteRenderPhaseRecord>>;
};

const METRICS_HEADER = 'x-ecopages-pipeline-metrics';

let pageModuleLoads = 0;
let pageModuleBuilds = 0;
let pageModuleCacheHits = 0;
let hostLoaderLoads = 0;
let diskCacheHits = 0;
let routeModuleArtifacts = 0;
let mdxTransforms = 0;
let collectionBuilds = 0;
const routeRenderPhases = new Map<RouteRenderPhase, RouteRenderPhaseRecord>();

export function isRequestPipelineMetricsEnabled(): boolean {
	return (
		process.env.ECOPAGES_REQUEST_PIPELINE_METRICS === '1' ||
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS === '1' ||
		process.env.ECOPAGES_LOGGER_DEBUG === 'true'
	);
}

export function getRequestPipelineMetricsHeaderName(): string {
	return METRICS_HEADER;
}

export function resolveRequestPipelineRuntime(): 'node' | 'bun' {
	return typeof Bun !== 'undefined' ? 'bun' : 'node';
}

export function recordPageModuleLoad(outcome: PageModuleLoadOutcome, artifactCount = 0): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	pageModuleLoads += 1;

	switch (outcome) {
		case 'import-cache-hit':
			pageModuleCacheHits += 1;
			break;
		case 'disk-cache-hit':
			diskCacheHits += 1;
			break;
		case 'cold-build':
			pageModuleBuilds += 1;
			routeModuleArtifacts += artifactCount;
			break;
		case 'host-loader':
			hostLoaderLoads += 1;
			break;
		case 'unified-graph':
			break;
	}
}

export function recordMdxTransform(): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	mdxTransforms += 1;
}

export function recordCollectionBuild(): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	collectionBuilds += 1;
}

export function recordRouteRenderPhase(phase: RouteRenderPhase, durationMs: number): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	const existing = routeRenderPhases.get(phase);
	if (existing) {
		existing.count += 1;
		existing.totalDurationMs += durationMs;
		existing.lastDurationMs = durationMs;
		return;
	}

	routeRenderPhases.set(phase, {
		count: 1,
		totalDurationMs: durationMs,
		lastDurationMs: durationMs,
	});
}

export async function measureRouteRenderPhase<T>(phase: RouteRenderPhase, fn: () => Promise<T>): Promise<T> {
	if (!isRequestPipelineMetricsEnabled()) {
		return fn();
	}

	const startedAt = performance.now();
	try {
		return await fn();
	} finally {
		recordRouteRenderPhase(phase, performance.now() - startedAt);
	}
}

export function getRequestPipelineMetricsSnapshot(): RequestPipelineMetricsSnapshot {
	return {
		runtime: resolveRequestPipelineRuntime(),
		pageModuleLoads,
		pageModuleBuilds,
		pageModuleCacheHits,
		hostLoaderLoads,
		diskCacheHits,
		routeModuleArtifacts,
		mdxTransforms,
		collectionBuilds,
		routeRenderPhases: Object.fromEntries(routeRenderPhases),
	};
}

export function serializeRequestPipelineMetricsHeader(): string {
	return JSON.stringify(getRequestPipelineMetricsSnapshot());
}

export function resetRequestPipelineMetrics(): void {
	pageModuleLoads = 0;
	pageModuleBuilds = 0;
	pageModuleCacheHits = 0;
	hostLoaderLoads = 0;
	diskCacheHits = 0;
	routeModuleArtifacts = 0;
	mdxTransforms = 0;
	collectionBuilds = 0;
	routeRenderPhases.clear();
}
