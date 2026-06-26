/**
 * Production build-speed benchmark for route-module disk caching.
 *
 * Uses the real kitchen-sink project and representative pages across integrations.
 *
 * Run with:
 *
 *   pnpm test:bench
 *   pnpm test:bench:compare
 */

import path from 'node:path';
import { bench, beforeAll, describe } from 'vitest';
import { installAppRuntimeBuildExecutor } from '../../../packages/core/src/build/runtime-build-executor.ts';
import { createAppModuleLoader } from '../../../packages/core/src/services/module-loading/app-server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir.ts';
import { KITCHEN_SINK_REPRESENTATIVE_PAGES } from './_kitchen-sink-fixture.ts';
import { loadStaticBuildBenchConfig } from './_static-build-fixture.ts';

process.env.NODE_ENV = 'production';

const WARM_PAGES = Object.values(KITCHEN_SINK_REPRESENTATIVE_PAGES);

async function importPageDiskWarm(filePath: string): Promise<void> {
	const config = await loadStaticBuildBenchConfig();
	installAppRuntimeBuildExecutor(config);
	const loader = createAppModuleLoader(config);
	const outdir = path.join(resolveInternalExecutionDir(config), '.server-modules');

	await loader.importModule({
		filePath,
		rootDir: config.rootDir,
		outdir,
	});
}

describe('build-speed-bench', () => {
	beforeAll(async () => {
		for (const page of WARM_PAGES) {
			await importPageDiskWarm(page);
		}
	});

	bench(
		'kitchen-sink warm route-module disk cache hit (index.kita.tsx)',
		async () => {
			await importPageDiskWarm(KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 1 },
	);

	bench(
		'kitchen-sink warm route-module disk cache hit (all integrations sample)',
		async () => {
			await Promise.all(WARM_PAGES.map((page) => importPageDiskWarm(page)));
		},
		{ time: 2000, warmupTime: 300, warmupIterations: 1 },
	);
});
