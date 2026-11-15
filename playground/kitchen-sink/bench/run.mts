import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from 'mitata';
import {
	BENCH_ENVIRONMENTS,
	createMitataBenchReport,
	mergeMitataBenchReports,
	mitataBenchJsonFor,
	printMitataBenchReport,
	scenariosFromMitataTrials,
	shouldRunBench,
	writeMitataBenchReport,
	MITATA_BENCH_JSON,
	type BenchEnvironment,
	type MitataBenchReport,
} from './lib/mitata-report';

const KITCHEN_SINK_DIR = fileURLToPath(new URL('..', import.meta.url));

/** @remarks Lit SSG and other integrations resolve app deps from the kitchen-sink package root. */
if (process.cwd() !== KITCHEN_SINK_DIR) {
	process.chdir(KITCHEN_SINK_DIR);
}

if (!shouldRunBench()) {
	console.error('Set ECOPAGES_BENCH=1 to run the kitchen-sink bundle benchmark.');
	process.exit(1);
}

/**
 * Bench groups by the `NODE_ENV` they measure: development groups time dev-server rebuilds, production groups
 * time `ecopages build`.
 *
 * @remarks
 * Each environment runs in its own process. `react` picks its development or production build from `NODE_ENV`
 * on first import, and the kitchen-sink config imports it, so switching `NODE_ENV` inside one process pairs the
 * development `react` with the production `react-dom/server` and React renders fail.
 */
const BENCH_GROUPS: Record<BenchEnvironment, Array<() => Promise<void>>> = {
	development: [
		async () => (await import('./hmr-bench')).registerHmrBench(),
		async () => (await import('./integration-bench')).registerIntegrationBench(),
		async () => (await import('./heavy-bench')).registerHeavyBench(),
		async () => (await import('./memory-snap-bench')).registerMemorySnapBench(),
	],
	production: [
		async () => (await import('./build-bench')).registerBuildBench(),
		async () => (await import('./static-build-bench')).registerStaticBuildBench(),
		async () => (await import('./build-speed-bench')).registerBuildSpeedBench(),
	],
};

function parseArgs(argv: string[]): { environment?: BenchEnvironment; summary: boolean } {
	const envIndex = argv.indexOf('--env');
	const value = envIndex === -1 ? undefined : argv[envIndex + 1];
	if (value !== undefined && !BENCH_ENVIRONMENTS.includes(value as BenchEnvironment)) {
		throw new Error(`--env must be one of ${BENCH_ENVIRONMENTS.join(', ')}, got "${value}".`);
	}
	return { environment: value as BenchEnvironment | undefined, summary: !argv.includes('--no-summary') };
}

async function runEnvironment(environment: BenchEnvironment, summary: boolean): Promise<void> {
	process.env.NODE_ENV = environment;
	for (const register of BENCH_GROUPS[environment]) {
		await register();
	}

	const benchFormat = process.env.ECOPAGES_BENCH_FORMAT === 'json' ? 'json' : undefined;
	const { benchmarks } = await run({
		throw: true,
		...(benchFormat ? { format: benchFormat } : {}),
	});

	const report = createMitataBenchReport(scenariosFromMitataTrials(benchmarks));
	const outputPath = mitataBenchJsonFor(environment);
	writeMitataBenchReport(report, outputPath);
	if (summary && !benchFormat) {
		printMitataBenchReport(report);
	}
	console.log(`Wrote ${outputPath} (${Object.keys(report.scenarios).length} scenarios).`);
}

/**
 * Runs every environment in its own child process, one after another, and merges their reports.
 *
 * @remarks
 * Sequential so the environments do not compete for CPU and skew each other's timings.
 */
function runAllEnvironments(): void {
	const reports: MitataBenchReport[] = [];
	for (const environment of BENCH_ENVIRONMENTS) {
		const outputPath = mitataBenchJsonFor(environment);
		rmSync(outputPath, { force: true });

		console.log(`\n[bench] ${environment} groups (NODE_ENV=${environment})`);
		const child = spawnSync(
			process.execPath,
			[...process.execArgv, fileURLToPath(import.meta.url), '--env', environment, '--no-summary'],
			{ stdio: 'inherit', env: { ...process.env, NODE_ENV: environment } },
		);
		if (child.status !== 0) {
			throw new Error(`The ${environment} bench process failed (exit ${child.status ?? child.signal}).`);
		}

		reports.push(JSON.parse(readFileSync(outputPath, 'utf-8')) as MitataBenchReport);
	}

	const report = mergeMitataBenchReports(reports);
	writeMitataBenchReport(report, MITATA_BENCH_JSON);
	if (process.env.ECOPAGES_BENCH_FORMAT !== 'json') {
		printMitataBenchReport(report);
	}
	console.log(`Wrote ${MITATA_BENCH_JSON} (${Object.keys(report.scenarios).length} scenarios).`);
}

const { environment, summary } = parseArgs(process.argv.slice(2));
if (environment) {
	await runEnvironment(environment, summary);
} else {
	runAllEnvironments();
}

await new Promise<void>((resolve, reject) => {
	process.stdout.write('', (error) => {
		if (error) {
			reject(error);
		} else {
			resolve();
		}
	});
});
process.exit(0);
