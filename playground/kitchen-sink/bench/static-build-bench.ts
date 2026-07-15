import path from 'node:path';
import { bench, group } from 'mitata';
import { build } from '../../../packages/core/src/build/build-adapter';
import { requireBuildRuntime, installBuildRuntime } from '../../../packages/core/src/build/build-runtime';
import {
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	recordServerEntryBuildCache,
} from '../../../packages/core/src/build/cache/server-entry-build-cache';
import { getAppModuleLoader } from '../../../packages/core/src/services/module-loading/app-server-module-transpiler.service';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir';
import { SERVER_BUNDLE_FILENAME } from '../../../packages/core/src/utils/resolve-entry-file';
import { KITCHEN_SINK_PATHS, KITCHEN_SINK_REPRESENTATIVE_PAGES } from './lib/kitchen-sink-fixture';
import {
	clearBenchProductionCaches,
	importRouteModuleDiskCold,
	loadKitchenSinkProductionConfig,
	loadStaticBuildBenchConfig,
	runBuildStatic,
	runStaticSiteGeneration,
} from './lib/static-build-fixture';
import {
	getPageModuleRolldownBuildInvocations,
	getTotalRolldownBuildInvocations,
	resetRolldownBuildInvocationCounts,
} from '../../../packages/core/src/build/rolldown/rolldown-build-invocation-metrics';
import { withBenchEnv } from './lib/bench-env';

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
	benchConfigPromise ??= (async () => {
		const config = await loadStaticBuildBenchConfig();
		for (const page of REPRESENTATIVE_PAGES) {
			await importStaticPageWarm(config, page);
		}
		return config;
	})();

	return benchConfigPromise;
}

async function bundleServerEntryCold(appConfig: Awaited<ReturnType<typeof loadStaticBuildBenchConfig>>): Promise<void> {
	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	installBuildRuntime(appConfig);

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
		requireBuildRuntime(appConfig).getProfile('server-entry'),
	);
}

async function ensureServerEntryCacheSeeded(): Promise<void> {
	if (serverEntrySeeded) {
		return;
	}

	const config = await loadStaticBuildBenchConfig();
	const entryPath = SERVER_ENTRY;
	const { serverOutdir, serverEntryPath } = getServerBundleOutputPaths(config);
	installBuildRuntime(config);

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
		requireBuildRuntime(config).getProfile('server-entry'),
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
	installBuildRuntime(appConfig);
	const loader = getAppModuleLoader(appConfig);
	const outdir = path.join(resolveInternalExecutionDir(appConfig), '.server-modules');

	await loader.importModule({
		filePath,
		rootDir: appConfig.rootDir,
		outdir,
	});
}

export function registerStaticBuildBench(): void {
	group('static-build-bench', () => {
		bench('kitchen-sink server entry bundle cold (app.ts)', async () => {
			await bundleServerEntryCold(await getBenchConfig());
		});

		bench('kitchen-sink server entry bundle warm (.eco cache hit)', async () => {
			await ensureServerEntryCacheSeeded();
			const config = await getBenchConfig();
			const cached = lookupServerEntryBuildCache({ appConfig: config, entryPath: SERVER_ENTRY });
			if (!cached) {
				throw new Error('Expected warm server-entry cache to be seeded');
			}
		});

		bench('kitchen-sink route-module rolldown cold (index.kita.tsx)', async () => {
			const config = await getBenchConfig();
			await importRouteModuleDiskCold(config, KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		});

		bench('kitchen-sink route-module warm import (index.kita.tsx)', async () => {
			await importStaticPageWarm(await getBenchConfig(), KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		});

		bench('kitchen-sink route-module warm import (all integrations sample)', async () => {
			const config = await getBenchConfig();
			await Promise.all(REPRESENTATIVE_PAGES.map((page) => importStaticPageWarm(config, page)));
		});

		bench('kitchen-sink StaticSiteGenerator.run warm (full route tree)', async () => {
			await runStaticSiteGeneration(await getBenchConfig(), { force: false, preserveExportDirectory: true });
		});

		bench('kitchen-sink buildStatic warm (full app, isolated dist)', async () => {
			await runBuildStatic(await getBenchConfig(), { force: false });
		});

		bench('kitchen-sink buildStatic cold baseline (unified graph off, metrics)', async () => {
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
		});

		bench('kitchen-sink buildStatic cold unified graph (default on, metrics)', async () => {
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
		});

		bench('kitchen-sink StaticSiteGenerator.run cold unified graph (default on)', async () => {
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
		});

		bench('kitchen-sink buildStatic cold (full app, isolated dist)', async () => {
			resetBenchSessionState();
			const config = await loadStaticBuildBenchConfig();
			clearBenchProductionCaches(config);
			await runBuildStatic(config, { force: true });
		});
	});

	if (process.env.ECOPAGES_BENCH_PRODUCTION_DIST === '1') {
		group('static-build-bench production dist', () => {
			bench('kitchen-sink buildStatic cold (full app, production dist/)', async () => {
				const config = await loadKitchenSinkProductionConfig();
				clearBenchProductionCaches(config);
				await runBuildStatic(config, { force: true });
			});
		});
	}
}
