import { afterEach, describe, expect, it, vi } from 'vitest';
import { withBenchEnv } from './bench-env';

describe('bench-env', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('applies bench env flags inside withBenchEnv and restores them after', async () => {
		vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', undefined);
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', undefined);

		await withBenchEnv({ unifiedPagesGraph: 'off', rolldownBuildMetrics: true }, async () => {
			expect(process.env.ECOPAGES_UNIFIED_PAGES_GRAPH).toBe('0');
			expect(process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS).toBe('1');
		});

		expect(process.env.ECOPAGES_UNIFIED_PAGES_GRAPH).toBeUndefined();
		expect(process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS).toBeUndefined();
	});
});
