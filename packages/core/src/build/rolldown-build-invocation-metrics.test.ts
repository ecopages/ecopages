import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
	getPageModuleRolldownBuildInvocations,
	getRolldownBuildInvocationCounts,
	getTotalRolldownBuildInvocations,
	isRolldownBuildMetricsEnabled,
	recordPageModuleBuildInvocation,
	recordRolldownBuildInvocation,
	resetRolldownBuildInvocationCounts,
} from './rolldown-build-invocation-metrics.ts';

describe('rolldown-build-invocation-metrics', () => {
	const originalMetrics = process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;

	afterEach(() => {
		if (originalMetrics === undefined) {
			delete process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;
		} else {
			process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = originalMetrics;
		}
		resetRolldownBuildInvocationCounts();
	});

	it('records invocations when metrics are enabled', () => {
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';
		assert.equal(isRolldownBuildMetricsEnabled(), true);

		recordRolldownBuildInvocation('rolldown');
		recordRolldownBuildInvocation('rolldown');

		assert.deepEqual(getRolldownBuildInvocationCounts(), {
			rolldown: 2,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 2);
	});

	it('tracks per-page route-module build invocations separately', () => {
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		recordPageModuleBuildInvocation();
		recordPageModuleBuildInvocation();

		assert.equal(getPageModuleRolldownBuildInvocations(), 2);
	});

	it('does not record invocations when metrics are disabled', () => {
		Reflect.deleteProperty(process.env, 'ECOPAGES_ROLLDOWN_BUILD_METRICS');
		Reflect.deleteProperty(process.env, 'ECOPAGES_LOGGER_DEBUG');

		recordRolldownBuildInvocation('rolldown');
		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});
});
