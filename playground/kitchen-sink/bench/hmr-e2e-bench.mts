import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { attachProcessOutput, stopChildProcess, waitForHttpReady } from './lib/startup-bench-process.mjs';
import { summarize } from './startup/startup-bench-stats.mjs';

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchDir, '../../..');
const kitchenSinkDir = path.resolve(benchDir, '..');
const ecopagesCli = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const resultsDir = path.join(benchDir, 'results');
const iterations = Number(process.env.ECOPAGES_HMR_BENCH_ITERATIONS ?? 5);
const warmupIterations = Number(process.env.ECOPAGES_HMR_BENCH_WARMUP ?? 1);
const pageRelativePath = 'src/pages/ecopages-jsx-hmr.eco.tsx';
const cssComponentRelativePath = 'src/components/dependency-discovery/counter.lit.tsx';
const cssFileRelativePath = 'src/components/dependency-discovery/hmr-extra.css';
const cssImport = "import './hmr-extra.css';";

async function pickFreePort(): Promise<number> {
	const probe = net.createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', resolve);
	});
	const address = probe.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected the benchmark port probe to use a TCP socket.');
	}
	await new Promise<void>((resolve, reject) => {
		probe.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

async function waitForHmr(page: Page): Promise<void> {
	const connection = page.waitForEvent('websocket', {
		predicate: (socket) => socket.url().endsWith('/_hmr'),
		timeout: 60_000,
	});
	await connection;
	await page.waitForFunction(() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__);
}

async function waitForCssWidth(page: Page, width: string): Promise<void> {
	await page.waitForFunction(
		(expectedWidth) => {
			const element = document.querySelector('.discovery-counter-host');
			return element !== null && getComputedStyle(element).borderTopWidth === expectedWidth;
		},
		width,
		{ timeout: 60_000 },
	);
}

async function measurePageEdits(page: Page, pageFile: string, originalSource: string): Promise<number[]> {
	const samples: number[] = [];
	let source = originalSource;
	let currentMarker = 'Ecopages JSX HMR baseline';

	for (let index = 0; index < warmupIterations + iterations; index += 1) {
		const nextMarker = `Ecopages JSX HMR benchmark ${index}`;
		source = source.replace(currentMarker, nextMarker);
		const startedAt = performance.now();
		writeFileSync(pageFile, source);
		await page.getByRole('heading', { name: nextMarker }).waitFor({ state: 'visible', timeout: 60_000 });
		const elapsed = performance.now() - startedAt;
		if (index >= warmupIterations) {
			samples.push(elapsed);
		}
		currentMarker = nextMarker;
	}

	return samples;
}

async function measureCssDiscoveryEdits(
	page: Page,
	componentFile: string,
	originalComponent: string,
): Promise<number[]> {
	const samples: number[] = [];
	const componentWithCss = `${originalComponent.trimEnd()}\n${cssImport}\n`;

	for (let index = 0; index < warmupIterations + iterations; index += 1) {
		const startedAt = performance.now();
		writeFileSync(componentFile, componentWithCss);
		await waitForCssWidth(page, '11px');
		const elapsed = performance.now() - startedAt;
		if (index >= warmupIterations) {
			samples.push(elapsed);
		}

		writeFileSync(componentFile, originalComponent);
		await waitForCssWidth(page, '7px');
	}

	return samples;
}

async function main(): Promise<void> {
	if (process.env.ECOPAGES_BENCH !== '1') {
		throw new Error('Set ECOPAGES_BENCH=1 to run the HMR end-to-end benchmark.');
	}

	const appDir = copyFixtureApp(kitchenSinkDir);
	let appPageFile: string | undefined;
	let originalPage: string | undefined;
	let appCssComponentFile: string | undefined;
	let originalCssComponent: string | undefined;
	let cssFile: string | undefined;
	let originalCss: string | undefined;
	let child: ReturnType<typeof spawn> | undefined;
	let browser: Browser | undefined;

	try {
		const port = await pickFreePort();
		const baseUrl = `http://127.0.0.1:${port}`;
		appPageFile = path.join(appDir, pageRelativePath);
		appCssComponentFile = path.join(appDir, cssComponentRelativePath);
		originalPage = readFileSync(appPageFile, 'utf8');
		originalCssComponent = readFileSync(appCssComponentFile, 'utf8');
		cssFile = path.join(appDir, cssFileRelativePath);
		originalCss = readFileSync(cssFile, 'utf8');
		const server = spawn(
			process.execPath,
			[ecopagesCli, 'dev', '--runtime', 'node', '--port', String(port), '--hostname', '127.0.0.1'],
			{
				cwd: appDir,
				env: {
					...process.env,
					NODE_ENV: 'development',
					ECOPAGES_BASE_URL: baseUrl,
					ECOPAGES_PORT: String(port),
					ECOPAGES_HOSTNAME: '127.0.0.1',
					ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS: '150',
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		child = server;
		const output = attachProcessOutput(server);
		const runtimeErrors: string[] = [];
		await waitForHttpReady(baseUrl, server, output);
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();
		page.on('pageerror', (error) => runtimeErrors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') {
				runtimeErrors.push(message.text());
			}
		});

		const pageHmrConnection = waitForHmr(page);
		await page.goto(`${baseUrl}/ecopages-jsx-hmr`, { waitUntil: 'domcontentloaded' });
		await pageHmrConnection;
		const pageSamples = await measurePageEdits(page, appPageFile, originalPage);

		const cssHmrConnection = waitForHmr(page);
		await page.goto(`${baseUrl}/discovery`, { waitUntil: 'domcontentloaded' });
		await cssHmrConnection;
		await waitForCssWidth(page, '7px');
		const cssSamples = await measureCssDiscoveryEdits(page, appCssComponentFile, originalCssComponent);

		if (runtimeErrors.length > 0) {
			throw new Error(`Browser runtime errors during HMR benchmark:\n${runtimeErrors.join('\n')}`);
		}

		const report = {
			generatedAt: new Date().toISOString(),
			runtime: process.version,
			platform: `${process.platform}-${process.arch}`,
			serverRuntime: 'node',
			iterations,
			warmupIterations,
			scenarios: {
				'page-edit-to-dom': { samplesMs: pageSamples, statsMs: summarize(pageSamples) },
				'css-discovery-edit-to-dom': { samplesMs: cssSamples, statsMs: summarize(cssSamples) },
			},
		};
		mkdirSync(resultsDir, { recursive: true });
		const outputPath = path.join(resultsDir, 'hmr-e2e-bench.json');
		writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
		console.log(JSON.stringify(report, null, 2));
		console.log(`Wrote ${outputPath}`);
	} finally {
		try {
			if (appPageFile && originalPage !== undefined) {
				writeFileSync(appPageFile, originalPage);
			}
			if (appCssComponentFile && originalCssComponent !== undefined) {
				writeFileSync(appCssComponentFile, originalCssComponent);
			}
			if (cssFile && originalCss !== undefined) {
				writeFileSync(cssFile, originalCss);
			}
		} finally {
			try {
				await browser?.close();
			} finally {
				try {
					if (child) {
						await stopChildProcess(child);
					}
				} finally {
					rmSync(appDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
				}
			}
		}
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
