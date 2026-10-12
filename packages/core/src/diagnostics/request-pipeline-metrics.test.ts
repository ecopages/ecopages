import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

async function loadFreshMetrics() {
	vi.resetModules();
	return await import('./request-pipeline-metrics.ts');
}

describe('request-pipeline-metrics', () => {
	beforeEach(() => {
		process.env.ECOPAGES_REQUEST_PIPELINE_METRICS = '1';
	});

	afterEach(() => {
		delete process.env.ECOPAGES_REQUEST_PIPELINE_METRICS;
	});

	it('stays disabled unless explicitly enabled', async () => {
		const metrics = await loadFreshMetrics();
		delete process.env.ECOPAGES_REQUEST_PIPELINE_METRICS;
		metrics.recordPageModuleLoad('cold-build', 3);
		assert.equal(metrics.isRequestPipelineMetricsEnabled(), false);
		assert.deepEqual(metrics.getRequestPipelineMetricsSnapshot().pageModuleBuilds, 0);
	});

	it('records page module load outcomes and artifact counts', async () => {
		const metrics = await loadFreshMetrics();
		metrics.recordPageModuleLoad('cold-build', 4);
		metrics.recordPageModuleLoad('import-cache-hit');
		metrics.recordPageModuleLoad('disk-cache-hit');
		metrics.recordPageModuleLoad('host-loader');

		const snapshot = metrics.getRequestPipelineMetricsSnapshot();
		assert.equal(snapshot.pageModuleLoads, 4);
		assert.equal(snapshot.pageModuleBuilds, 1);
		assert.equal(snapshot.pageModuleCacheHits, 1);
		assert.equal(snapshot.diskCacheHits, 1);
		assert.equal(snapshot.hostLoaderLoads, 1);
		assert.equal(snapshot.routeModuleArtifacts, 4);
	});

	it('records mdx transforms and route render phases', async () => {
		const metrics = await loadFreshMetrics();
		metrics.recordMdxTransform();
		metrics.recordMdxTransform();
		metrics.recordRouteRenderPhase('page-browser-graph', 12.5);

		const snapshot = metrics.getRequestPipelineMetricsSnapshot();
		assert.equal(snapshot.mdxTransforms, 2);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.count, 1);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.lastDurationMs, 12.5);
	});

	it('serializes metrics for response headers', async () => {
		const metrics = await loadFreshMetrics();
		metrics.recordPageModuleLoad('cold-build', 1);
		const parsed = JSON.parse(metrics.serializeRequestPipelineMetricsHeader());
		assert.equal(parsed.pageModuleBuilds, 1);
		assert.equal(parsed.runtime, 'node');
	});
});
