/**
 * Consolidates vitest bench output into a single baseline.json.
 *
 * Run with:
 *   pnpm test:bench              (generates vitest-bench.json with results)
 *   pnpm exec tsx _consolidate.ts (merges into baseline.json)
 *
 * The output is the single source of truth for "where the bundle path was
 * before any optimization work". Use `pnpm test:bench:compare` to diff
 * against it.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = fileURLToPath(new URL('./results', import.meta.url));
const VITEST_FILE = path.join(RESULTS_DIR, 'vitest-bench.json');
const BASELINE_FILE = path.join(RESULTS_DIR, 'bench-baseline.json');

type BenchStats = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p75: number;
	p99: number;
	hz: number;
};

type Benchmark = {
	name: string;
	min: number;
	max: number;
	mean: number;
	period: number;
	hz: number;
	p50: number;
	p75: number;
	p99: number;
	p995: number;
	p999: number;
	sampleCount: number;
	rme: number;
};

type VitestBenchFile = {
	filepath: string;
	groups: { fullName: string; benchmarks: Benchmark[] }[];
};

type VitestBenchOutput = { files: VitestBenchFile[] };

type Baseline = {
	generatedAt: string;
	runtime: string;
	platform: string;
	scenarios: Record<string, BenchStats>;
	notes: string[];
};

const notes: string[] = [
	'Bench uses Vitest native bench() API (tinybench under the hood).',
	'Each bench runs until `time` ms elapse, then reports min/median/p75/p99/etc.',
	'Bundle path is fast: single-file rebuilds complete in single-digit ms on the kitchen-sink.',
	'Heavy library import graph (react + react-dom + lit + kitajs + mdx) added in heavy-bench.bench.ts.',
	'Run `pnpm test:bench:compare` to diff current results against this baseline.',
];

function ms(period: number): number {
	return Math.round(period * 1000) / 1000;
}

function main(): void {
	if (!existsSync(VITEST_FILE)) {
		console.error(`No vitest-bench.json found in ${RESULTS_DIR}. Run "pnpm test:bench" first.`);
		process.exit(1);
	}

	const vitestData = JSON.parse(readFileSync(VITEST_FILE, 'utf-8')) as VitestBenchOutput;
	const scenarios: Record<string, BenchStats> = {};

	for (const file of vitestData.files) {
		for (const group of file.groups) {
			for (const bench of group.benchmarks) {
			scenarios[bench.name] = {
				count: bench.sampleCount,
				min: ms(bench.min),
				max: ms(bench.max),
				mean: ms(bench.mean),
				median: ms(bench.p50 ?? bench.mean),
				p75: ms(bench.p75),
				p99: ms(bench.p99),
				hz: Math.round(bench.hz),
			};
			}
		}
	}

	const baseline: Baseline = {
		generatedAt: new Date().toISOString(),
		runtime: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`,
		platform: process.platform,
		scenarios,
		notes,
	};

	writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2), 'utf-8');
	console.log(
		`Wrote ${BASELINE_FILE} with ${Object.keys(scenarios).length} scenarios.`,
	);
	console.log('  Commit this file to track perf evolution. Use "pnpm test:bench:compare" to diff against it.');

	mkdirSync(RESULTS_DIR, { recursive: true });

	// Print summary table to stdout
	console.log('\nScenario                                          | median (ms) | p99 (ms) |   hz');
	console.log('--------------------------------------------------|-------------|----------|------');
	for (const [name, stats] of Object.entries(scenarios)) {
		const shortName = name.length > 50 ? `${name.slice(0, 47)}...` : name;
		console.log(
			`${shortName.padEnd(50)} | ${String(stats.median).padStart(11)} | ${String(stats.p99).padStart(8)} | ${String(stats.hz).padStart(5)}`,
		);
	}
}

main();
