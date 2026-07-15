/**
 * Compares startup benchmark output against the committed startup baseline.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));
const CURRENT_FILE = path.join(RESULTS_DIR, 'startup-bench.json');
const BASELINE_FILE = path.join(RESULTS_DIR, 'startup-baseline.json');
const REGRESSION_THRESHOLD = 1.15;

type StatSummary = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p95: number;
};

function formatRatio(current: number, baseline: number): string {
	if (baseline <= 0) {
		return 'n/a';
	}

	return `${(current / baseline).toFixed(2)}x`;
}

function readBaselineScenarios(filePath: string): Record<string, StatSummary> {
	const baseline = JSON.parse(readFileSync(filePath, 'utf-8')) as { scenarios: Record<string, StatSummary> };
	return baseline.scenarios;
}

function readCurrentScenarios(filePath: string): Record<string, StatSummary> {
	const report = JSON.parse(readFileSync(filePath, 'utf-8')) as {
		scenarios: Array<{
			name: string;
			stats: {
				interactiveReadyMs: StatSummary;
				listenerReadyMs: StatSummary;
				firstPageBrowserGraphMs: StatSummary;
			};
		}>;
	};

	const scenarios: Record<string, StatSummary> = {};
	for (const scenario of report.scenarios) {
		scenarios[`${scenario.name}:interactiveReadyMs`] = scenario.stats.interactiveReadyMs;
		scenarios[`${scenario.name}:listenerReadyMs`] = scenario.stats.listenerReadyMs;
		scenarios[`${scenario.name}:firstPageBrowserGraphMs`] = scenario.stats.firstPageBrowserGraphMs;
	}

	return scenarios;
}

function main(): void {
	if (!existsSync(CURRENT_FILE)) {
		console.error(`No startup-bench.json found in ${RESULTS_DIR}. Run "pnpm test:bench:startup" first.`);
		process.exit(1);
	}

	if (!existsSync(BASELINE_FILE)) {
		console.error(`No startup-baseline.json found in ${RESULTS_DIR}. Run "pnpm test:bench:startup:baseline" first.`);
		process.exit(1);
	}

	const baselineScenarios = readBaselineScenarios(BASELINE_FILE);
	const currentScenarios = readCurrentScenarios(CURRENT_FILE);
	const scenarioNames = [...new Set([...Object.keys(baselineScenarios), ...Object.keys(currentScenarios)])].sort();

	console.log('Scenario                                          | baseline | current | median ratio | p95 ratio');
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
		const p95Ratio = current.p95 / baseline.p95;
		const flagged = medianRatio > REGRESSION_THRESHOLD || p95Ratio > REGRESSION_THRESHOLD;
		if (flagged) {
			regressions += 1;
		}

		console.log(
			`${shortName.padEnd(50)} | ${String(baseline.median).padStart(8)} | ${String(current.median).padStart(7)} | ${formatRatio(current.median, baseline.median).padStart(12)} | ${formatRatio(current.p95, baseline.p95).padStart(8)}${flagged ? ' [regression]' : ''}`,
		);
	}

	if (regressions > 0) {
		console.error(`\nDetected ${regressions} startup scenario regression(s) above ${REGRESSION_THRESHOLD}x.`);
		process.exit(1);
	}

	console.log('\nAll compared startup scenarios are within the regression threshold.');
}

main();
