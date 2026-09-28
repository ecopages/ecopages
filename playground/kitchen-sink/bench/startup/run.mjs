/**
 * Process-level kitchen-sink startup benchmark.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScenarioStats, resolveTracePath, runStartupIteration } from './startup-bench-iteration.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const kitchenSinkDir = path.resolve(scriptDir, '..', '..');
const repoRoot = path.resolve(kitchenSinkDir, '..', '..');
const ecopagesCli = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');
const resultsDir = path.join(scriptDir, '..', 'results');
const iterations = Number(process.env.ECOPAGES_STARTUP_BENCH_ITERATIONS ?? 5);
const warmupIterations = Number(process.env.ECOPAGES_STARTUP_BENCH_WARMUP ?? 1);

const STARTUP_PAGES = [
	{ name: 'kita-home', path: '/', selector: '[data-testid="page-home"]' },
	{ name: 'react-lab', path: '/react-lab', selector: '[data-testid="page-react-lab"]' },
	{
		name: 'lit-entry',
		path: '/integration-matrix/lit-entry',
		selector: '[data-testid="page-integration-matrix-lit-entry"]',
	},
	{
		name: 'ecopages-jsx-entry',
		path: '/integration-matrix/ecopages-jsx-entry',
		selector: '[data-testid="page-integration-matrix-ecopages-jsx-entry"]',
	},
	{ name: 'docs-mdx', path: '/docs', selector: '[data-testid="page-docs"]' },
];

function shouldRunBench() {
	return process.env.ECOPAGES_BENCH === '1';
}

async function runScenario({ name, runtime, page, isolated }) {
	const port = 4100 + Math.floor(Math.random() * 500);
	const baseUrl = `http://127.0.0.1:${port}`;
	const tracePath = resolveTracePath(resultsDir, name);
	const samples = [];
	const launcher = runtime === 'bun' ? 'bun' : 'node';

	for (let iteration = 0; iteration < warmupIterations + iterations; iteration += 1) {
		const sample = await runStartupIteration({
			launcher,
			runtime,
			ecopagesCli,
			kitchenSinkDir,
			port,
			baseUrl,
			page,
			name,
			iteration,
			isolated,
			tracePath,
		});

		if (iteration >= warmupIterations) {
			samples.push(sample);
		}
	}

	return {
		name,
		runtime,
		page: page.name,
		isolated,
		samples,
		stats: buildScenarioStats(samples),
	};
}

async function main() {
	if (!shouldRunBench()) {
		console.error('Set ECOPAGES_BENCH=1 to run the startup benchmark.');
		process.exit(1);
	}

	mkdirSync(resultsDir, { recursive: true });

	const scenarios = [];
	for (const runtime of ['node', 'bun']) {
		for (const page of STARTUP_PAGES) {
			scenarios.push(
				await runScenario({
					name: `cold-${runtime}-${page.name}`,
					runtime,
					page,
					isolated: true,
				}),
			);
		}
	}

	scenarios.push(
		await runScenario({
			name: 'warm-node-kita-home',
			runtime: 'node',
			page: STARTUP_PAGES[0],
			isolated: false,
		}),
	);

	const report = {
		generatedAt: new Date().toISOString(),
		runtime: process.version,
		platform: process.platform,
		iterations,
		warmupIterations,
		scenarios,
	};

	const outputPath = path.join(resultsDir, 'startup-bench.json');
	writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
	console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
