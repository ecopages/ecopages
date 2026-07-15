/**
 * Consolidates startup benchmark output into a committed baseline schema.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));
const INPUT_FILE = path.join(RESULTS_DIR, 'startup-bench.json');
const OUTPUT_FILE = path.join(RESULTS_DIR, 'startup-baseline.json');

type StatSummary = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p95: number;
};

type StartupBaseline = {
	generatedAt: string;
	runtime: string;
	platform: string;
	scenarios: Record<string, StatSummary>;
	notes: string[];
};

function main(): void {
	if (!existsSync(INPUT_FILE)) {
		console.error(`No startup-bench.json found in ${RESULTS_DIR}. Run "pnpm test:bench:startup" first.`);
		process.exit(1);
	}

	const report = JSON.parse(readFileSync(INPUT_FILE, 'utf-8')) as {
		generatedAt: string;
		runtime: string;
		platform: string;
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

	const baseline: StartupBaseline = {
		generatedAt: report.generatedAt,
		runtime: report.runtime,
		platform: report.platform,
		scenarios,
		notes: ['Process-level kitchen-sink startup baseline. Regenerate with pnpm test:bench:startup:baseline.'],
	};

	mkdirSync(RESULTS_DIR, { recursive: true });
	writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2), 'utf-8');
	console.log(`Wrote ${OUTPUT_FILE}`);
}

main();
