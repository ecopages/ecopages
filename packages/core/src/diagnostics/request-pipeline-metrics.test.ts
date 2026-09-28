import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
	getRequestPipelineMetricsSnapshot,
	isRequestPipelineMetricsEnabled,
	recordMdxTransform,
	recordPageModuleLoad,
	recordRouteRenderPhase,
	resetRequestPipelineMetrics,
	serializeRequestPipelineMetricsHeader,
} from './request-pipeline-metrics.ts';

describe('request-pipeline-metrics', () => {
	beforeEach(() => {
		resetRequestPipelineMetrics();
		process.env.ECOPAGES_REQUEST_PIPELINE_METRICS = '1';
	});

	afterEach(() => {
		delete process.env.ECOPAGES_REQUEST_PIPELINE_METRICS;
		resetRequestPipelineMetrics();
	});

	it('stays disabled unless explicitly enabled', () => {
		delete process.env.ECOPAGES_REQUEST_PIPELINE_METRICS;
		recordPageModuleLoad('cold-build', 3);
		assert.equal(isRequestPipelineMetricsEnabled(), false);
		assert.deepEqual(getRequestPipelineMetricsSnapshot().pageModuleBuilds, 0);
	});

	it('records page module load outcomes and artifact counts', () => {
		recordPageModuleLoad('cold-build', 4);
		recordPageModuleLoad('import-cache-hit');
		recordPageModuleLoad('disk-cache-hit');
		recordPageModuleLoad('host-loader');

		const snapshot = getRequestPipelineMetricsSnapshot();
		assert.equal(snapshot.pageModuleLoads, 4);
		assert.equal(snapshot.pageModuleBuilds, 1);
		assert.equal(snapshot.pageModuleCacheHits, 1);
		assert.equal(snapshot.diskCacheHits, 1);
		assert.equal(snapshot.hostLoaderLoads, 1);
		assert.equal(snapshot.routeModuleArtifacts, 4);
	});

	it('records mdx transforms and route render phases', () => {
		recordMdxTransform();
		recordMdxTransform();
		recordRouteRenderPhase('page-browser-graph', 12.5);

		const snapshot = getRequestPipelineMetricsSnapshot();
		assert.equal(snapshot.mdxTransforms, 2);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.count, 1);
		assert.equal(snapshot.routeRenderPhases['page-browser-graph']?.lastDurationMs, 12.5);
	});

	it('serializes metrics for response headers', () => {
		recordPageModuleLoad('cold-build', 1);
		const parsed = JSON.parse(serializeRequestPipelineMetricsHeader());
		assert.equal(parsed.pageModuleBuilds, 1);
		assert.equal(parsed.runtime, 'node');
	});
});
