import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

async function loadFreshMetrics() {
	vi.resetModules();
	return await import('./request-pipeline-metrics.ts');
}

describe('request-pipeline-metrics', () => {
	beforeEach(() => {
		vi.stubEnv('ECOPAGES_REQUEST_PIPELINE_METRICS', '1');
	});

	afterEach(() => {
		vi.stubEnv('ECOPAGES_REQUEST_PIPELINE_METRICS', undefined);
	});

	it('stays disabled unless explicitly enabled', async () => {
		const metrics = await loadFreshMetrics();
		const state = metrics.createRequestPipelineMetricsState();
		vi.stubEnv('ECOPAGES_REQUEST_PIPELINE_METRICS', undefined);
		metrics.recordPageModuleLoad(state, 'cold-build', 3);
		assert.equal(metrics.isRequestPipelineMetricsEnabled(), false);
		assert.deepEqual(metrics.getRequestPipelineMetricsSnapshot(state).pageModuleBuilds, 0);
	});

	it('records page module load outcomes and artifact counts', async () => {
		const metrics = await loadFreshMetrics();
		const state = metrics.createRequestPipelineMetricsState();
		metrics.recordPageModuleLoad(state, 'cold-build', 4);
		metrics.recordPageModuleLoad(state, 'import-cache-hit');
		metrics.recordPageModuleLoad(state, 'disk-cache-hit');
		metrics.recordPageModuleLoad(state, 'host-loader');

		const snapshot = metrics.getRequestPipelineMetricsSnapshot(state);
		assert.equal(snapshot.pageModuleLoads, 4);
		assert.equal(snapshot.pageModuleBuilds, 1);
		assert.equal(snapshot.pageModuleCacheHits, 1);
		assert.equal(snapshot.diskCacheHits, 1);
		assert.equal(snapshot.hostLoaderLoads, 1);
		assert.equal(snapshot.routeModuleArtifacts, 4);
	});

	it('records mdx transforms and route render phases', async () => {
		const metrics = await loadFreshMetrics();
		const state = metrics.createRequestPipelineMetricsState();
		metrics.recordMdxTransform(state);
		metrics.recordMdxTransform(state);
		metrics.recordRouteRenderPhase(state, 'page-browser-graph', 12.5);

		const snapshot = metrics.getRequestPipelineMetricsSnapshot(state);
		assert.equal(snapshot.mdxTransforms, 2);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.count, 1);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.lastDurationMs, 12.5);
	});

	it('serializes metrics for response headers', async () => {
		const metrics = await loadFreshMetrics();
		const state = metrics.createRequestPipelineMetricsState();
		metrics.recordPageModuleLoad(state, 'cold-build', 1);
		const parsed = JSON.parse(metrics.serializeRequestPipelineMetricsHeader(state));
		assert.equal(parsed.pageModuleBuilds, 1);
		assert.equal(parsed.runtime, 'node');
	});

	it('keeps counters separate for two app runtimes', async () => {
		const metrics = await loadFreshMetrics();
		const first = metrics.createRequestPipelineMetricsState();
		const second = metrics.createRequestPipelineMetricsState();
		metrics.recordPageModuleLoad(first, 'cold-build', 2);
		metrics.recordCollectionBuild(second);

		assert.equal(metrics.getRequestPipelineMetricsSnapshot(first).pageModuleBuilds, 1);
		assert.equal(metrics.getRequestPipelineMetricsSnapshot(first).collectionBuilds, 0);
		assert.equal(metrics.getRequestPipelineMetricsSnapshot(second).pageModuleBuilds, 0);
		assert.equal(metrics.getRequestPipelineMetricsSnapshot(second).collectionBuilds, 1);
	});
});
