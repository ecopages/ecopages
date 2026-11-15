import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeMitataBenchReports, printMitataBenchReport, quantile, summarize, type BenchStats } from './mitata-report';

const STATS: BenchStats = { count: 1, min: 1, max: 1, mean: 1, median: 1, p75: 1, p99: 1, hz: 1000 };

function reportWith(...names: string[]) {
	return {
		generatedAt: '2026-11-14T00:00:00.000Z',
		runtime: 'node v24',
		platform: 'darwin',
		scenarios: Object.fromEntries(names.map((name) => [name, STATS])),
	};
}

describe('mitata-report', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

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

	it('truncates long scenario labels without shifting statistic columns', () => {
		const output: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((line: string) => {
			output.push(line);
		});

		printMitataBenchReport({
			generatedAt: '2026-07-15T00:00:00.000Z',
			runtime: 'node v24',
			platform: 'darwin',
			scenarios: {
				'very long scenario name that should not make the terminal statistics columns unreadable': {
					count: 1,
					min: 1,
					max: 1,
					mean: 1,
					median: 1.234,
					p75: 1,
					p99: 2.345,
					hz: 810,
				},
			},
		});

		expect(output.some((line) => line.includes('…'))).toBe(true);
		expect(output.some((line) => line.includes('1.234 ms') && line.includes('2.345 ms'))).toBe(true);
	});

	it('merges the per-environment reports into one', () => {
		const merged = mergeMitataBenchReports([reportWith('dev rebuild'), reportWith('static build')]);
		expect(Object.keys(merged.scenarios)).toEqual(['dev rebuild', 'static build']);
	});

	it('rejects a scenario registered in more than one environment', () => {
		expect(() => mergeMitataBenchReports([reportWith('page build'), reportWith('page build')])).toThrow(
			'Bench scenario "page build" is registered in more than one environment.',
		);
	});
});
