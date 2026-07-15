import { describe, expect, it } from 'vitest';
import { quantile, summarize } from './mitata-report';

describe('mitata-report', () => {
	it('summarizes duration samples', () => {
		const stats = summarize([10, 20, 30, 40]);
		expect(stats).toMatchObject({
			count: 4,
			min: 10,
			max: 40,
			mean: 25,
			median: 25,
			p95: 38.5,
		});
	});

	it('computes quantiles for startup samples', () => {
		const sorted = [100, 120, 140, 160, 200];
		expect(quantile(sorted, 0.5)).toBe(140);
		expect(quantile(sorted, 0.95)).toBeGreaterThan(160);
	});
});
