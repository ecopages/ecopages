/**
 * Process-level kitchen-sink startup benchmark.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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

function quantile(sorted, q) {
	if (sorted.length === 0) {
		return 0;
	}

	const idx = (sorted.length - 1) * q;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) {
		return sorted[lo];
	}

	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(durations) {
	const sorted = [...durations].sort((left, right) => left - right);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		count: sorted.length,
		min: sorted[0] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		mean: sorted.length > 0 ? sum / sorted.length : 0,
		median: quantile(sorted, 0.5),
		p95: quantile(sorted, 0.95),
	};
}

function waitForProcessExit(childProcess) {
	return new Promise((resolve) => {
		if (childProcess.exitCode !== null) {
			resolve(childProcess.exitCode);
			return;
		}

		childProcess.once('exit', (code) => resolve(code));
	});
}

function attachProcessOutput(childProcess) {
	const output = [];

	const record = (chunk) => {
		output.push(String(chunk));
	};

	childProcess.stdout.on('data', record);
	childProcess.stderr.on('data', record);

	return {
		getOutput() {
			return output.join('');
		},
	};
}

async function waitForHttpReady(baseUrl, childProcess, output, timeoutMs = 120_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (childProcess.exitCode !== null) {
			throw new Error(
				`Dev server exited before becoming ready (code=${childProcess.exitCode})\n${output.getOutput()}`,
			);
		}

		try {
			const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) {
				return;
			}
		} catch (error) {
			if (childProcess.exitCode !== null) {
				throw new Error(
					`Dev server exited before becoming ready (code=${childProcess.exitCode})\n${output.getOutput()}`,
				);
			}

			if (!(error instanceof Error) || error.name !== 'TimeoutError') {
				// Retry until the deadline; connection errors are expected while booting.
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	throw new Error(`Timed out waiting for dev server HTTP ready at ${baseUrl}\n${output.getOutput()}`);
}

async function stopChildProcess(childProcess) {
	if (childProcess.exitCode !== null) {
		return;
	}

	childProcess.kill('SIGTERM');

	const exited = await Promise.race([
		waitForProcessExit(childProcess),
		new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
	]);

	if (exited === null) {
		childProcess.kill('SIGKILL');
		await waitForProcessExit(childProcess);
	}
}

async function runScenario({ name, runtime, page, isolated }) {
	const port = 4100 + Math.floor(Math.random() * 500);
	const baseUrl = `http://127.0.0.1:${port}`;
	const tracePath = path.join(resultsDir, `startup-trace-${name}.json`);
	const samples = [];
	const launcher = runtime === 'bun' ? 'bun' : 'node';

	for (let iteration = 0; iteration < warmupIterations + iterations; iteration += 1) {
		const artifactScope = isolated ? `bench-startup-${name}-${iteration}` : 'bench-startup-warm';
		const iterationTracePath = `${tracePath}.${iteration}.json`;
		const processStart = performance.now();

		const child = spawn(
			launcher,
			[ecopagesCli, 'dev', '--runtime', runtime, '--port', String(port), '--hostname', '127.0.0.1'],
			{
				cwd: kitchenSinkDir,
				env: {
					...process.env,
					NODE_ENV: 'development',
					ECOPAGES_STARTUP_TRACE: 'true',
					ECOPAGES_STARTUP_TRACE_JSON: iterationTracePath,
					ECOPAGES_E2E_ARTIFACT_SCOPE: artifactScope,
					ECOPAGES_BASE_URL: baseUrl,
					ECOPAGES_PORT: String(port),
					ECOPAGES_HOSTNAME: '127.0.0.1',
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		const output = attachProcessOutput(child);

		await waitForHttpReady(baseUrl, child, output);
		const listenerReadyMs = performance.now() - processStart;

		const browser = await chromium.launch({ headless: true });
		const pageHandle = await browser.newPage();
		let requestCount = 0;
		let transferredBytes = 0;
		pageHandle.on('response', (response) => {
			requestCount += 1;
			const headers = response.headers();
			const contentLength = Number(headers['content-length'] ?? 0);
			if (Number.isFinite(contentLength) && contentLength > 0) {
				transferredBytes += contentLength;
			}
		});

		const navigationStart = performance.now();
		const response = await pageHandle.goto(`${baseUrl}${page.path}`, { waitUntil: 'domcontentloaded' });
		const requestTiming = response?.request().timing();
		const firstByteMs =
			requestTiming && requestTiming.responseStart >= 0 && requestTiming.requestStart >= 0
				? requestTiming.responseStart - requestTiming.requestStart
				: null;
		await pageHandle.waitForSelector(page.selector, { timeout: 120_000 });
		const interactiveReadyMs = performance.now() - navigationStart;
		await browser.close();

		await stopChildProcess(child);

		const trace = JSON.parse(readFileSync(iterationTracePath, 'utf-8'));
		const sample = {
			listenerReadyMs,
			interactiveReadyMs,
			firstByteMs,
			firstRequestWallMs: trace.firstRequest?.wallMs ?? null,
			firstPageBrowserGraphMs: trace.phases?.['first-page-browser-graph']?.durationMs ?? null,
			firstRequestSsrMs: trace.phases?.['first-request-ssr']?.durationMs ?? null,
			graphBuildCount: trace.firstRequest?.graphBuildCount ?? null,
			clientBundleBytes: trace.firstRequest?.clientBundleBytes ?? null,
			bundleCount: trace.firstRequest?.bundleCount ?? null,
			requestCount,
			transferredBytes,
		};

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
		stats: {
			listenerReadyMs: summarize(samples.map((sample) => sample.listenerReadyMs)),
			interactiveReadyMs: summarize(samples.map((sample) => sample.interactiveReadyMs)),
			firstPageBrowserGraphMs: summarize(
				samples.map((sample) => sample.firstPageBrowserGraphMs).filter((value) => typeof value === 'number'),
			),
		},
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
