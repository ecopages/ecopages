/**
 * Compares the latest mitata bench output against the consolidated baseline.
 *
 * Run with:
 *   pnpm test:bench:compare
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCH_RESULTS_DIR, MITATA_BENCH_JSON, type BenchStats, type MitataBenchReport } from '../lib/mitata-report';

const BASELINE_FILE = path.join(BENCH_RESULTS_DIR, 'bench-baseline.json');

type Baseline = MitataBenchReport & {
	notes?: string[];
};

const REGRESSION_THRESHOLD = 1.15;

function readBaselineScenarios(filePath: string): Record<string, BenchStats> {
	const baseline = JSON.parse(readFileSync(filePath, 'utf-8')) as Baseline;
	return baseline.scenarios;
}

function readCurrentScenarios(filePath: string): Record<string, BenchStats> {
	const report = JSON.parse(readFileSync(filePath, 'utf-8')) as MitataBenchReport;
	return report.scenarios;
}

function formatRatio(current: number, baseline: number): string {
	if (baseline <= 0) {
		return 'n/a';
	}

	return `${(current / baseline).toFixed(2)}x`;
}

function main(): void {
	if (!existsSync(MITATA_BENCH_JSON)) {
		console.error(`No mitata-bench.json found in ${BENCH_RESULTS_DIR}. Run "pnpm test:bench" first.`);
		process.exit(1);
	}

	if (!existsSync(BASELINE_FILE)) {
		console.error(`No bench-baseline.json found in ${BENCH_RESULTS_DIR}. Run "pnpm test:bench:baseline" first.`);
		process.exit(1);
	}

	const baselineScenarios = readBaselineScenarios(BASELINE_FILE);
	const currentScenarios = readCurrentScenarios(MITATA_BENCH_JSON);
	const scenarioNames = [...new Set([...Object.keys(baselineScenarios), ...Object.keys(currentScenarios)])].sort();

	console.log('Scenario                                          | baseline | current | median ratio | p99 ratio');
	console.log('--------------------------------------------------|----------|---------|--------------|----------');

	let regressions = 0;

	for (const name of scenarioNames) {
		const baseline = baselineScenarios[name];
		const current = currentScenarios[name];
		const shortName = name.length > 50 ? `${name.slice(0, 47)}...` : name;

		if (!baseline || !current) {
			console.log(`${shortName.padEnd(50)} | missing scenario data`);
			regressions += 1;
			continue;
		}

		const medianRatio = current.median / baseline.median;
		const p99Ratio = current.p99 / baseline.p99;
		const flagged = medianRatio > REGRESSION_THRESHOLD || p99Ratio > REGRESSION_THRESHOLD;
		if (flagged) {
			regressions += 1;
		}

		console.log(
			`${shortName.padEnd(50)} | ${String(baseline.median).padStart(8)} | ${String(current.median).padStart(7)} | ${formatRatio(current.median, baseline.median).padStart(12)} | ${formatRatio(current.p99, baseline.p99).padStart(8)}${flagged ? ' [regression]' : ''}`,
		);
	}

	if (regressions > 0) {
		console.error(`\nDetected ${regressions} scenario regression(s) above ${REGRESSION_THRESHOLD}x.`);
		process.exit(1);
	}

	console.log('\nAll compared scenarios are within the regression threshold.');
}

main();
