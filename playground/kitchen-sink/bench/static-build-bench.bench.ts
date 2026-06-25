/**
 * Static production build benchmarks for kitchen-sink.
 *
 * All scenarios use the real `playground/kitchen-sink` project (same config as
 * `eco.config.ts`): all integrations, processors, routes, and `app.ts` entry.
 *
 * Micro segments time individual operations on representative pages. E2E segments
 * (`StaticSiteGenerator.run`, `buildStatic`) export the full route tree.
 *
 * Run with:
 *
 *   pnpm test:bench
 *   pnpm test:bench:compare
 */

import path from 'node:path';
import { bench, describe } from 'vitest';
import { build } from '../../../packages/core/src/build/build-adapter';
import {
	getInstalledServerEntryBuildExecutor,
	installAppRuntimeBuildExecutor,
} from '../../../packages/core/src/build/runtime-build-executor';
import {
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	recordServerEntryBuildCache,
} from '../../../packages/core/src/build/server-entry-build-cache';
import { getAppModuleLoader } from '../../../packages/core/src/services/module-loading/app-server-module-transpiler.service';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir';
import { SERVER_BUNDLE_FILENAME } from '../../../packages/core/src/utils/resolve-entry-file';
import { KITCHEN_SINK_PATHS, KITCHEN_SINK_REPRESENTATIVE_PAGES } from './_kitchen-sink-fixture';
import {
	clearBenchProductionCaches,
	importRouteModuleDiskCold,
	loadKitchenSinkProductionConfig,
	loadStaticBuildBenchConfig,
	runBuildStatic,
	runStaticSiteGeneration,
} from './_static-build-fixture';
import {
	getPageModuleRolldownBuildInvocations,
	getTotalRolldownBuildInvocations,
	resetRolldownBuildInvocationCounts,
} from '../../../packages/core/src/build/rolldown-build-invocation-metrics';
import { withBenchEnv } from './_bench-utils';

process.env.NODE_ENV = 'production';

const SERVER_ENTRY = path.join(KITCHEN_SINK_PATHS.root, 'app.ts');
const REPRESENTATIVE_PAGES = Object.values(KITCHEN_SINK_REPRESENTATIVE_PAGES);

let benchConfigPromise: Promise<Awaited<ReturnType<typeof loadStaticBuildBenchConfig>>> | undefined;
let serverEntrySeeded = false;

function resetBenchSessionState(): void {
	benchConfigPromise = undefined;
	serverEntrySeeded = false;
}

async function getBenchConfig(): Promise<Awaited<ReturnType<typeof loadStaticBuildBenchConfig>>> {
	if (!benchConfigPromise) {
		benchConfigPromise = (async () => {
			const config = await loadStaticBuildBenchConfig();
			for (const page of REPRESENTATIVE_PAGES) {
				await importStaticPageWarm(config, page);
			}
			return config;
		})();
	}
	return benchConfigPromise;
}

async function bundleServerEntryCold(appConfig: Awaited<ReturnType<typeof loadStaticBuildBenchConfig>>): Promise<void> {
	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	installAppRuntimeBuildExecutor(appConfig);

	await build(
		{
			entrypoints: [SERVER_ENTRY],
			outdir: serverOutdir,
			naming: SERVER_BUNDLE_FILENAME,
			target: 'node',
			format: 'esm',
			sourcemap: 'hidden',
			externalPackages: true,
			root: appConfig.rootDir,
		},
		getInstalledServerEntryBuildExecutor(appConfig),
	);
}

async function ensureServerEntryCacheSeeded(): Promise<void> {
	if (serverEntrySeeded) {
		return;
	}

	const config = await loadStaticBuildBenchConfig();
	const entryPath = SERVER_ENTRY;
	const { serverOutdir, serverEntryPath } = getServerBundleOutputPaths(config);
	installAppRuntimeBuildExecutor(config);

	const result = await build(
		{
			entrypoints: [entryPath],
			outdir: serverOutdir,
			naming: SERVER_BUNDLE_FILENAME,
			target: 'node',
			format: 'esm',
			sourcemap: 'hidden',
			externalPackages: true,
			root: config.rootDir,
		},
		getInstalledServerEntryBuildExecutor(config),
	);

	recordServerEntryBuildCache({
		appConfig: config,
		entryPath,
		buildResult: result,
		outputPaths: result.outputs.length > 0 ? result.outputs.map((output) => output.path) : [serverEntryPath],
	});

	serverEntrySeeded = true;
}

async function importStaticPageWarm(
	appConfig: Awaited<ReturnType<typeof loadStaticBuildBenchConfig>>,
	filePath: string,
): Promise<void> {
	installAppRuntimeBuildExecutor(appConfig);
	const loader = getAppModuleLoader(appConfig);
	const outdir = path.join(resolveInternalExecutionDir(appConfig), '.server-modules');

	await loader.importModule({
		filePath,
		rootDir: appConfig.rootDir,
		outdir,
	});
}

describe('static-build-bench', () => {
	bench(
		'kitchen-sink server entry bundle cold (app.ts)',
		async () => {
			await bundleServerEntryCold(await getBenchConfig());
		},
		{ time: 3000, warmupTime: 500, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink server entry bundle warm (.eco cache hit)',
		async () => {
			await ensureServerEntryCacheSeeded();
			const config = await getBenchConfig();
			const cached = lookupServerEntryBuildCache({ appConfig: config, entryPath: SERVER_ENTRY });
			if (!cached) {
				throw new Error('Expected warm server-entry cache to be seeded');
			}
		},
		{ time: 1000, warmupTime: 200, warmupIterations: 2 },
	);

	bench(
		'kitchen-sink route-module rolldown cold (index.kita.tsx)',
		async () => {
			const config = await getBenchConfig();
			await importRouteModuleDiskCold(config, KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		},
		{ time: 3000, warmupTime: 500, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink route-module warm import (index.kita.tsx)',
		async () => {
			await importStaticPageWarm(await getBenchConfig(), KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'kitchen-sink route-module warm import (all integrations sample)',
		async () => {
			const config = await getBenchConfig();
			await Promise.all(REPRESENTATIVE_PAGES.map((page) => importStaticPageWarm(config, page)));
		},
		{ time: 3000, warmupTime: 500, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink StaticSiteGenerator.run warm (full route tree)',
		async () => {
			await runStaticSiteGeneration(await getBenchConfig(), { force: false, preserveExportDirectory: true });
		},
		{ time: 12000, warmupTime: 2000, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink buildStatic warm (full app, isolated dist)',
		async () => {
			await runBuildStatic(await getBenchConfig(), { force: false });
		},
		{ time: 15000, warmupTime: 3000, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink buildStatic cold baseline (unified graph off, metrics)',
		async () => {
			await withBenchEnv(
				{ nodeEnv: 'production', unifiedPagesGraph: 'off', rolldownBuildMetrics: true },
				async () => {
					resetBenchSessionState();
					const config = await loadStaticBuildBenchConfig();
					clearBenchProductionCaches(config);
					resetRolldownBuildInvocationCounts();
					await runBuildStatic(config, { force: true });
					if (getTotalRolldownBuildInvocations() === 0) {
						throw new Error('Expected Rolldown build metrics to be recorded');
					}
				},
			);
		},
		{ time: 20000, warmupTime: 0, warmupIterations: 0, iterations: 1 },
	);

	bench(
		'kitchen-sink buildStatic cold unified graph (default on, metrics)',
		async () => {
			await withBenchEnv(
				{ nodeEnv: 'production', unifiedPagesGraph: 'default', rolldownBuildMetrics: true },
				async () => {
					resetBenchSessionState();
					const config = await loadStaticBuildBenchConfig();
					clearBenchProductionCaches(config);
					resetRolldownBuildInvocationCounts();
					await runBuildStatic(config, { force: true });
					if (getPageModuleRolldownBuildInvocations() > 0) {
						throw new Error(
							`Expected zero per-page route-module Rolldown invocations, got ${getPageModuleRolldownBuildInvocations()}`,
						);
					}
				},
			);
		},
		{ time: 20000, warmupTime: 0, warmupIterations: 0, iterations: 1 },
	);

	bench(
		'kitchen-sink StaticSiteGenerator.run cold unified graph (default on)',
		async () => {
			await withBenchEnv(
				{ nodeEnv: 'production', unifiedPagesGraph: 'default', rolldownBuildMetrics: true },
				async () => {
					resetBenchSessionState();
					const config = await loadStaticBuildBenchConfig();
					clearBenchProductionCaches(config);
					resetRolldownBuildInvocationCounts();
					await runStaticSiteGeneration(config, { force: true });
					if (getPageModuleRolldownBuildInvocations() > 0) {
						throw new Error(
							`Expected zero per-page route-module Rolldown invocations during SSG, got ${getPageModuleRolldownBuildInvocations()}`,
						);
					}
				},
			);
		},
		{ time: 20000, warmupTime: 0, warmupIterations: 0, iterations: 1 },
	);

	bench(
		'kitchen-sink buildStatic cold (full app, isolated dist)',
		async () => {
			resetBenchSessionState();
			const config = await loadStaticBuildBenchConfig();
			clearBenchProductionCaches(config);
			await runBuildStatic(config, { force: true });
		},
		{ time: 20000, warmupTime: 0, warmupIterations: 0, iterations: 1 },
	);
});

if (process.env.ECOPAGES_BENCH_PRODUCTION_DIST === '1') {
	describe('static-build-bench production dist', () => {
		bench(
			'kitchen-sink buildStatic cold (full app, production dist/)',
			async () => {
				const config = await loadKitchenSinkProductionConfig();
				clearBenchProductionCaches(config);
				await runBuildStatic(config, { force: true });
			},
			{ time: 30000, warmupTime: 0, warmupIterations: 0, iterations: 1 },
		);
	});
}
