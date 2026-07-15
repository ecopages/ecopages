/**
 * Consolidates mitata bench output into the versioned baseline.
 *
 * Run with:
 *   pnpm test:bench
 *   pnpm test:bench:baseline
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BENCH_RESULTS_DIR, MITATA_BENCH_JSON, type MitataBenchReport } from '../lib/mitata-report';

const BASELINE_FILE = path.join(BENCH_RESULTS_DIR, 'bench-baseline.json');

type Baseline = MitataBenchReport & {
	notes: string[];
};

const notes: string[] = [
	'Bench uses mitata (https://github.com/evanwashere/mitata).',
	'Each scenario runs until mitata collects stable samples, then reports min/median/p75/p99.',
	'Bundle path is fast: single-file rebuilds complete in single-digit ms on the kitchen-sink.',
	'Heavy library import graph (react + react-dom + lit + kitajs + mdx) in heavy-bench.ts.',
	'Run `pnpm test:bench:compare` to diff current results against this baseline.',
];

function main(): void {
	if (!existsSync(MITATA_BENCH_JSON)) {
		console.error(`No mitata-bench.json found in ${BENCH_RESULTS_DIR}. Run "pnpm test:bench" first.`);
		process.exit(1);
	}

	const report = JSON.parse(readFileSync(MITATA_BENCH_JSON, 'utf-8')) as MitataBenchReport;
	const baseline: Baseline = {
		...report,
		generatedAt: new Date().toISOString(),
		notes,
	};

	mkdirSync(BENCH_RESULTS_DIR, { recursive: true });
	writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2), 'utf-8');
	console.log(`Wrote ${BASELINE_FILE} with ${Object.keys(baseline.scenarios).length} scenarios.`);
	console.log('  Commit this file to track perf evolution. Use "pnpm test:bench:compare" to diff against it.');

	console.log('\nScenario                                          | median (ms) | p99 (ms) |   hz');
	console.log('--------------------------------------------------|-------------|----------|------');
	for (const [name, stats] of Object.entries(baseline.scenarios)) {
		const shortName = name.length > 50 ? `${name.slice(0, 47)}...` : name;
		console.log(
			`${shortName.padEnd(50)} | ${String(stats.median).padStart(11)} | ${String(stats.p99).padStart(8)} | ${String(stats.hz).padStart(5)}`,
		);
	}
}

main();
