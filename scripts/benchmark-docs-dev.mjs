/**
 * Measures the docs development journey against an already-running server.
 *
 * Usage:
 *   pnpm run test:bench:docs -- --url http://127.0.0.1:3000
 *   pnpm run test:bench:docs -- --start --runtime node
 *   pnpm run test:bench:docs -- --start --runtime bun
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const baseUrl = readOption('--url') ?? process.env.ECOPAGES_DOCS_URL ?? 'http://127.0.0.1:3000';
const iterations = Number(readOption('--iterations') ?? 1);
const outputJson = args.includes('--json');
const startServer = args.includes('--start');
const runtime = readOption('--runtime') ?? process.env.ECOPAGES_BENCH_RUNTIME ?? 'node';
const metricsHeader = 'x-ecopages-pipeline-metrics';
const docsPaths = [
	'/docs/getting-started/installation',
	'/docs/getting-started/configuration',
	'/docs/core/concepts',
	'/docs/core/architecture',
	'/docs/server/server-api',
];

if (!Number.isInteger(iterations) || iterations < 1) {
	throw new Error('--iterations must be a positive integer');
}

if (runtime !== 'node' && runtime !== 'bun') {
	throw new Error('--runtime must be "node" or "bun"');
}

function readOption(name) {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function formatMs(value) {
	return `${Math.round(value)} ms`;
}

async function measureHttp(pathname) {
	const startedAt = performance.now();
	const response = await fetch(new URL(pathname, baseUrl));
	await response.arrayBuffer();
	const metricsHeaderValue = response.headers.get(metricsHeader);
	return {
		path: pathname,
		status: response.status,
		elapsedMs: performance.now() - startedAt,
		cache: response.headers.get('x-cache') ?? response.headers.get('x-ecopages-cache') ?? 'unknown',
		pipelineMetrics: metricsHeaderValue ? JSON.parse(metricsHeaderValue) : null,
	};
}

async function waitForServer(childProcess) {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (childProcess.exitCode !== null) {
			throw new Error(`Docs dev server exited before becoming ready (code ${childProcess.exitCode})`);
		}

		try {
			const response = await fetch(new URL('/', baseUrl), { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) {
				return;
			}
		} catch {
			// The server is expected to refuse connections while it is booting.
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error(`Timed out waiting for docs dev server at ${baseUrl}`);
}

async function stopServer(childProcess) {
	if (childProcess.exitCode !== null) {
		return;
	}

	childProcess.kill('SIGTERM');
	await new Promise((resolve) => childProcess.once('exit', resolve));
}

async function readTelemetry(page) {
	return page.evaluate(() => {
		const element = document.querySelector('#__ECO_DEV_NAV_TELEMETRY__');
		if (!element?.textContent) {
			return null;
		}

		try {
			return JSON.parse(element.textContent);
		} catch {
			return null;
		}
	});
}

async function waitForPageContent(page, previousContent) {
	await page.waitForFunction((previous) => {
		const mains = document.querySelectorAll('main');
		const main = mains[mains.length - 1];
		return main instanceof HTMLElement && main.innerText.trim().length > 0 && main.innerText !== previous;
	}, previousContent);
}

async function navigateTo(page, pathname) {
	const main = page.locator('main').last();
	const previousContent = await main.innerText().catch(() => '');
	const startedAt = performance.now();
	const link = page.locator(`a[href="${pathname}"]`).first();

	if ((await link.count()) === 0) {
		throw new Error(`No SPA link found for ${pathname} from ${new URL(page.url()).pathname}`);
	}

	await Promise.all([page.waitForURL((url) => url.pathname === pathname), link.click()]);
	await waitForPageContent(page, previousContent);

	const telemetry = await readTelemetry(page);
	const lastNavigation = telemetry?.history?.at(-1);
	return {
		path: pathname,
		elapsedMs: performance.now() - startedAt,
		routerMs: lastNavigation?.durationMs ?? null,
		telemetry,
	};
}

async function runIteration(browser, iteration) {
	const page = await browser.newPage();
	const startedAt = performance.now();
	await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
	await page.locator('main').last().waitFor({ state: 'visible' });
	const indexReadyMs = performance.now() - startedAt;

	const firstDocsPath = '/docs/getting-started/introduction';
	const firstDocs = await navigateTo(page, firstDocsPath);
	const navigations = [firstDocs];
	for (const pathname of docsPaths) {
		navigations.push(await navigateTo(page, pathname));
	}

	const result = {
		iteration,
		indexReadyMs,
		indexToDocsMs: firstDocs.elapsedMs,
		navigations,
		finalTelemetry: await readTelemetry(page),
	};
	await page.close();
	return result;
}

let serverProcess;
let serverReadyMs = null;
const benchmarkStartedAt = performance.now();
if (startServer) {
	const port = new URL(baseUrl).port || '3000';
	const docsDir = path.join(process.cwd(), 'apps/docs');
	const serverEnv = {
		...process.env,
		ECOPAGES_BASE_URL: baseUrl,
		ECOPAGES_HOSTNAME: new URL(baseUrl).hostname,
		ECOPAGES_PORT: port,
		ECOPAGES_REQUEST_PIPELINE_METRICS: '1',
	};
	if (runtime === 'bun') {
		serverProcess = spawn('bun', ['run', 'dev'], {
			cwd: docsDir,
			env: serverEnv,
			stdio: 'ignore',
		});
	} else {
		serverProcess = spawn('pnpm', ['run', 'dev'], {
			cwd: docsDir,
			env: serverEnv,
			stdio: 'ignore',
		});
	}
	await waitForServer(serverProcess);
	serverReadyMs = performance.now() - benchmarkStartedAt;
}

try {
	const httpPaths = ['/', '/docs/getting-started/introduction', ...docsPaths];
	const httpResults = [];
	for (const pathname of httpPaths) {
		httpResults.push(await measureHttp(pathname));
	}

	const browser = await chromium.launch({ headless: true });
	const browserResults = [];
	try {
		for (let iteration = 1; iteration <= iterations; iteration += 1) {
			browserResults.push(await runIteration(browser, iteration));
		}
	} finally {
		await browser.close();
	}

	const report = { runtime, baseUrl, serverReadyMs, http: httpResults, browser: browserResults };
	if (outputJson) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(`Docs dev benchmark (${runtime}): ${baseUrl}`);
		if (serverReadyMs !== null) {
			console.log(`Server ready: ${formatMs(serverReadyMs)}`);
		}
		console.log('\nHTTP response timings');
		for (const result of httpResults) {
			console.log(`${result.path.padEnd(48)} ${formatMs(result.elapsedMs).padStart(8)}  ${result.cache}`);
			if (result.pipelineMetrics) {
				const metrics = result.pipelineMetrics;
				console.log(
					`  pipeline: loads=${metrics.pageModuleLoads} builds=${metrics.pageModuleBuilds} mdx=${metrics.mdxTransforms} artifacts=${metrics.routeModuleArtifacts}`,
				);
			}
		}

		console.log('\nBrowser journey timings');
		for (const result of browserResults) {
			console.log(
				`iteration ${result.iteration}: index usable ${formatMs(result.indexReadyMs)}, index → docs ${formatMs(result.indexToDocsMs)}`,
			);
			for (const navigation of result.navigations) {
				const routerTiming =
					navigation.routerMs === null ? 'toolbar n/a' : `router ${formatMs(navigation.routerMs)}`;
				console.log(
					`  ${navigation.path.padEnd(46)} ${formatMs(navigation.elapsedMs).padStart(8)}  ${routerTiming}`,
				);
			}
		}

		const telemetryAvailable = browserResults.some((result) => result.finalTelemetry !== null);
		console.log(`\nDev-toolbar telemetry: ${telemetryAvailable ? 'available' : 'not found'}`);
	}
} finally {
	if (serverProcess) {
		await stopServer(serverProcess);
	}
}
