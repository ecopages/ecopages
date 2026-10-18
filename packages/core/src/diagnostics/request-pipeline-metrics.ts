/**
 * Per-request and process-wide counters for the development render pipeline.
 *
 * @remarks
 * Gated behind {@link isRequestPipelineMetricsEnabled} so production paths stay quiet.
 * Benchmarks and structural invariant tests read the snapshot via
 * {@link getRequestPipelineMetricsSnapshot}.
 */

import { getProcessRuntime } from '../utils/runtime.ts';
import { isEcopagesEnvEnabled } from '../env.ts';

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

export type RequestPipelineMetricsState = {
	pageModuleLoads: number;
	pageModuleBuilds: number;
	pageModuleCacheHits: number;
	hostLoaderLoads: number;
	diskCacheHits: number;
	routeModuleArtifacts: number;
	mdxTransforms: number;
	collectionBuilds: number;
	routeRenderPhases: Map<RouteRenderPhase, RouteRenderPhaseRecord>;
};

const METRICS_HEADER = 'x-ecopages-pipeline-metrics';

export function createRequestPipelineMetricsState(): RequestPipelineMetricsState {
	return {
		pageModuleLoads: 0,
		pageModuleBuilds: 0,
		pageModuleCacheHits: 0,
		hostLoaderLoads: 0,
		diskCacheHits: 0,
		routeModuleArtifacts: 0,
		mdxTransforms: 0,
		collectionBuilds: 0,
		routeRenderPhases: new Map(),
	};
}

export function isRequestPipelineMetricsEnabled(): boolean {
	return (
		isEcopagesEnvEnabled('ECOPAGES_REQUEST_PIPELINE_METRICS') ||
		isEcopagesEnvEnabled('ECOPAGES_ROLLDOWN_BUILD_METRICS') ||
		isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG')
	);
}

export function getRequestPipelineMetricsHeaderName(): string {
	return METRICS_HEADER;
}

export function recordPageModuleLoad(
	state: RequestPipelineMetricsState,
	outcome: PageModuleLoadOutcome,
	artifactCount = 0,
): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	state.pageModuleLoads += 1;

	switch (outcome) {
		case 'import-cache-hit':
			state.pageModuleCacheHits += 1;
			break;
		case 'disk-cache-hit':
			state.diskCacheHits += 1;
			break;
		case 'cold-build':
			state.pageModuleBuilds += 1;
			state.routeModuleArtifacts += artifactCount;
			break;
		case 'host-loader':
			state.hostLoaderLoads += 1;
			break;
		case 'unified-graph':
			break;
	}
}

export function recordMdxTransform(state: RequestPipelineMetricsState): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	state.mdxTransforms += 1;
}

export function recordCollectionBuild(state: RequestPipelineMetricsState): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	state.collectionBuilds += 1;
}

export function recordRouteRenderPhase(
	state: RequestPipelineMetricsState,
	phase: RouteRenderPhase,
	durationMs: number,
): void {
	if (!isRequestPipelineMetricsEnabled()) {
		return;
	}

	const existing = state.routeRenderPhases.get(phase);
	if (existing) {
		existing.count += 1;
		existing.totalDurationMs += durationMs;
		existing.lastDurationMs = durationMs;
		return;
	}

	state.routeRenderPhases.set(phase, {
		count: 1,
		totalDurationMs: durationMs,
		lastDurationMs: durationMs,
	});
}

export async function measureRouteRenderPhase<T>(
	state: RequestPipelineMetricsState,
	phase: RouteRenderPhase,
	fn: () => Promise<T>,
): Promise<T> {
	if (!isRequestPipelineMetricsEnabled()) {
		return fn();
	}

	const startedAt = performance.now();
	try {
		return await fn();
	} finally {
		recordRouteRenderPhase(state, phase, performance.now() - startedAt);
	}
}

export function getRequestPipelineMetricsSnapshot(state: RequestPipelineMetricsState): RequestPipelineMetricsSnapshot {
	return {
		runtime: getProcessRuntime().name,
		pageModuleLoads: state.pageModuleLoads,
		pageModuleBuilds: state.pageModuleBuilds,
		pageModuleCacheHits: state.pageModuleCacheHits,
		hostLoaderLoads: state.hostLoaderLoads,
		diskCacheHits: state.diskCacheHits,
		routeModuleArtifacts: state.routeModuleArtifacts,
		mdxTransforms: state.mdxTransforms,
		collectionBuilds: state.collectionBuilds,
		routeRenderPhases: Object.fromEntries(state.routeRenderPhases),
	};
}

export function serializeRequestPipelineMetricsHeader(state: RequestPipelineMetricsState): string {
	return JSON.stringify(getRequestPipelineMetricsSnapshot(state));
}
