import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { attachProcessOutput, stopChildProcess, waitForHttpReady } from './startup-bench-process.mjs';
import { summarize } from './startup-bench-stats.mjs';

export function buildStartupSample(trace, metrics) {
	return {
		listenerReadyMs: metrics.listenerReadyMs,
		interactiveReadyMs: metrics.interactiveReadyMs,
		firstByteMs: metrics.firstByteMs,
		firstRequestWallMs: trace.firstRequest?.wallMs ?? null,
		firstPageBrowserGraphMs: trace.phases?.['first-page-browser-graph']?.durationMs ?? null,
		firstRequestSsrMs: trace.phases?.['first-request-ssr']?.durationMs ?? null,
		graphBuildCount: trace.firstRequest?.graphBuildCount ?? null,
		clientBundleBytes: trace.firstRequest?.clientBundleBytes ?? null,
		bundleCount: trace.firstRequest?.bundleCount ?? null,
		requestCount: metrics.requestCount,
		transferredBytes: metrics.transferredBytes,
	};
}

export async function measurePageNavigation(baseUrl, page) {
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

	return { interactiveReadyMs, firstByteMs, requestCount, transferredBytes };
}

export async function runStartupIteration({
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
}) {
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
	const navigation = await measurePageNavigation(baseUrl, page);
	await stopChildProcess(child);

	const trace = JSON.parse(readFileSync(iterationTracePath, 'utf-8'));
	return buildStartupSample(trace, { listenerReadyMs, ...navigation });
}

export function buildScenarioStats(samples) {
	return {
		listenerReadyMs: summarize(samples.map((sample) => sample.listenerReadyMs)),
		interactiveReadyMs: summarize(samples.map((sample) => sample.interactiveReadyMs)),
		firstPageBrowserGraphMs: summarize(
			samples.map((sample) => sample.firstPageBrowserGraphMs).filter((value) => typeof value === 'number'),
		),
	};
}

export function resolveTracePath(resultsDir, name) {
	return path.join(resultsDir, `startup-trace-${name}.json`);
}
