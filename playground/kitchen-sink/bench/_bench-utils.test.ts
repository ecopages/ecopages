import { describe, expect, it } from 'vitest';
import { restoreBenchEnv, snapshotBenchEnv, summarize, withBenchEnv } from './_bench-utils';

describe('_bench-utils', () => {
	it('summarizes duration samples', () => {
		const stats = summarize([10, 20, 30, 40]);
		expect(stats).toMatchObject({
			count: 4,
			min: 10,
			max: 40,
			mean: 25,
			median: 25,
		});
	});

	it('restores bench env flags after withBenchEnv', async () => {
		const snapshot = snapshotBenchEnv();
		delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
		delete process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;

		await withBenchEnv(
			{ nodeEnv: 'production', unifiedPagesGraph: 'off', rolldownBuildMetrics: true },
			async () => {
				expect(process.env.NODE_ENV).toBe('production');
				expect(process.env.ECOPAGES_UNIFIED_PAGES_GRAPH).toBe('0');
				expect(process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS).toBe('1');
			},
		);

		restoreBenchEnv(snapshot);
		expect(process.env.ECOPAGES_UNIFIED_PAGES_GRAPH).toBe(snapshot.unifiedPagesGraph);
		expect(process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS).toBe(snapshot.rolldownBuildMetrics);
	});
});
