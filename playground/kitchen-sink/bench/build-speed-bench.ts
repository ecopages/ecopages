import path from 'node:path';
import { bench, group } from 'mitata';
import { installAppRuntimeBuildExecutor } from '../../../packages/core/src/build/runtime-build-executor';
import { createAppModuleLoader } from '../../../packages/core/src/services/module-loading/app-server-module-transpiler.service';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir';
import { KITCHEN_SINK_REPRESENTATIVE_PAGES } from './lib/kitchen-sink-fixture';
import { loadStaticBuildBenchConfig } from './lib/static-build-fixture';

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

const warmPagesPromise = Promise.all(WARM_PAGES.map((page) => importPageDiskWarm(page)));

export async function registerBuildSpeedBench(): Promise<void> {
	await warmPagesPromise;

	group('build-speed-bench', () => {
		bench('kitchen-sink warm route-module disk cache hit (index.kita.tsx)', async () => {
			await importPageDiskWarm(KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		});

		bench('kitchen-sink warm route-module disk cache hit (all integrations sample)', async () => {
			await Promise.all(WARM_PAGES.map((page) => importPageDiskWarm(page)));
		});
	});
}
