import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';
import { attachProcessOutput, stopChildProcess, waitForHttpReady } from './lib/startup-bench-process.mjs';

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const kitchenSinkDir = path.resolve(benchDir, '..');
const repoRoot = path.resolve(benchDir, '../../..');
const ecopagesCli = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const configFile = 'bench/ssr-bench.eco.config.ts';
const distDir = 'dist-bench-ssr';
const workDir = '.eco-bench-ssr';
const resultsDir = path.join(benchDir, 'results');

const DURATION_SECONDS = Number(process.env.ECOPAGES_SSR_BENCH_DURATION ?? 10);
const WARMUP_SECONDS = Number(process.env.ECOPAGES_SSR_BENCH_WARMUP ?? 2);
const CONNECTIONS = Number(process.env.ECOPAGES_SSR_BENCH_CONNECTIONS ?? 10);

/**
 * Routes that render per request when the page cache is off. `/latest` is an explicit `app.get` route and
 * `/api/v1/ping` an endpoint, so neither is a file-system page.
 */
const ROUTES = [
	{ name: 'kita', path: '/' },
	{ name: 'kita-dynamic', path: '/patterns/middleware' },
	{ name: 'kita-explicit-view', path: '/latest' },
	{ name: 'react', path: '/react-lab' },
	{ name: 'lit-ssr', path: '/integration-matrix/lit-entry' },
	{ name: 'mdx', path: '/docs' },
	{ name: 'ecopages-jsx', path: '/integration-matrix/ecopages-jsx-entry' },
	{ name: 'api', path: '/api/v1/ping' },
] as const;

interface RouteResult {
	name: string;
	path: string;
	requestsPerSec: number;
	latencyMs: { p50: number; p97_5: number; p99: number; mean: number; max: number };
	requests: number;
	errors: number;
	timeouts: number;
	non2xx: number;
	bytesPerSec: number;
}

function parseArgs(argv: string[]): { runtime: 'node' | 'bun'; cache: boolean } {
	const runtimeIndex = argv.indexOf('--runtime');
	const runtime = runtimeIndex === -1 ? 'node' : argv[runtimeIndex + 1];
	if (runtime !== 'node' && runtime !== 'bun') {
		throw new Error(`--runtime must be node or bun, got "${runtime}".`);
	}
	return { runtime, cache: argv.includes('--cache') };
}

async function pickFreePort(): Promise<number> {
	const probe = net.createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', resolve);
	});
	const address = probe.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected the port probe to use a TCP socket.');
	}
	await new Promise<void>((resolve, reject) => {
		probe.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

function rssMb(pid: number): number | null {
	const result = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
	const kb = Number(result.stdout.trim());
	return Number.isFinite(kb) && kb > 0 ? Math.round(kb / 1024) : null;
}

async function drive(baseUrl: string, routePath: string, duration: number): Promise<autocannon.Result> {
	return autocannon({ url: `${baseUrl}${routePath}`, connections: CONNECTIONS, duration });
}

async function main(): Promise<void> {
	if (process.env.ECOPAGES_BENCH !== '1') {
		console.error('Set ECOPAGES_BENCH=1 to run the SSR throughput benchmark.');
		process.exit(1);
	}

	const { runtime, cache } = parseArgs(process.argv.slice(2));
	const launcher = runtime === 'bun' ? 'bun' : 'node';
	const env = {
		...process.env,
		NODE_ENV: 'production',
		...(cache ? { ECOPAGES_BENCH_SSR_CACHE: '1' } : {}),
	};

	rmSync(path.join(kitchenSinkDir, distDir), { recursive: true, force: true });
	rmSync(path.join(kitchenSinkDir, workDir), { recursive: true, force: true });

	console.log(`Building kitchen-sink into ${distDir} (cache ${cache ? 'on' : 'off'})`);
	const build = spawnSync(launcher, [ecopagesCli, 'build', '--runtime', runtime, '--config', configFile], {
		cwd: kitchenSinkDir,
		env,
		stdio: 'inherit',
	});
	if (build.status !== 0) {
		throw new Error(`ecopages build failed with status ${build.status}.`);
	}

	const port = await pickFreePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const server = spawn(
		launcher,
		[
			ecopagesCli,
			'start',
			'--runtime',
			runtime,
			'--config',
			configFile,
			'--dist-dir',
			distDir,
			'--port',
			String(port),
			'--hostname',
			'127.0.0.1',
		],
		{
			cwd: kitchenSinkDir,
			env: { ...env, ECOPAGES_PORT: String(port), ECOPAGES_HOSTNAME: '127.0.0.1' },
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	const output = attachProcessOutput(server);
	const stop = () => stopChildProcess(server);
	const onSignal = () => {
		server.kill('SIGKILL');
		process.exit(130);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);

	const results: RouteResult[] = [];
	let rssBeforeMb: number | null = null;
	let rssAfterMb: number | null = null;
	try {
		await waitForHttpReady(baseUrl, server, output);
		rssBeforeMb = server.pid ? rssMb(server.pid) : null;

		for (const route of ROUTES) {
			const probe = await fetch(`${baseUrl}${route.path}`);
			if (!probe.ok) {
				throw new Error(`${route.path} answered ${probe.status} before the run.\n${output.getOutput()}`);
			}
			await probe.arrayBuffer();

			await drive(baseUrl, route.path, WARMUP_SECONDS);
			const result = await drive(baseUrl, route.path, DURATION_SECONDS);
			results.push({
				name: route.name,
				path: route.path,
				requestsPerSec: result.requests.average,
				latencyMs: {
					p50: result.latency.p50,
					p97_5: result.latency.p97_5,
					p99: result.latency.p99,
					mean: result.latency.average,
					max: result.latency.max,
				},
				requests: result.requests.total,
				errors: result.errors,
				timeouts: result.timeouts,
				non2xx: result.non2xx,
				bytesPerSec: result.throughput.average,
			});
		}
		rssAfterMb = server.pid ? rssMb(server.pid) : null;
	} finally {
		process.off('SIGINT', onSignal);
		process.off('SIGTERM', onSignal);
		await stop();
		rmSync(path.join(kitchenSinkDir, distDir), { recursive: true, force: true });
		rmSync(path.join(kitchenSinkDir, workDir), { recursive: true, force: true });
	}

	const loadAverage = os.loadavg()[0]!;
	const report = {
		generatedAt: new Date().toISOString(),
		runtime,
		nodeVersion: process.version,
		cache,
		durationSeconds: DURATION_SECONDS,
		warmupSeconds: WARMUP_SECONDS,
		connections: CONNECTIONS,
		loadAverage1m: Number(loadAverage.toFixed(2)),
		serverRssMb: { beforeRun: rssBeforeMb, afterRun: rssAfterMb },
		routes: results,
	};

	mkdirSync(resultsDir, { recursive: true });
	const outputPath = path.join(resultsDir, 'ssr-bench.json');
	writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

	console.table(
		results.map((route) => ({
			route: route.name,
			path: route.path,
			'req/s': Math.round(route.requestsPerSec),
			'p50 ms': route.latencyMs.p50,
			'p97.5 ms': route.latencyMs.p97_5,
			'p99 ms': route.latencyMs.p99,
			'errors/timeouts/non2xx': `${route.errors}/${route.timeouts}/${route.non2xx}`,
		})),
	);
	console.log(
		`runtime=${runtime} cache=${cache ? 'on' : 'off'} connections=${CONNECTIONS} duration=${DURATION_SECONDS}s load(1m)=${loadAverage.toFixed(2)} server RSS ${rssBeforeMb}MB -> ${rssAfterMb}MB`,
	);
	console.log(`Wrote ${outputPath}`);

	const failed = results.filter((route) => route.errors > 0 || route.timeouts > 0 || route.non2xx > 0);
	if (failed.length > 0) {
		throw new Error(`Routes with errors or non-2xx responses: ${failed.map((route) => route.name).join(', ')}`);
	}
}

main().then(
	() => process.exit(0),
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
