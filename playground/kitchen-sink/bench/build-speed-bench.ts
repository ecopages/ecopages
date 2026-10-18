import path from 'node:path';
import { bench, group } from 'mitata';
import { installBuildQueue } from '../../../packages/core/src/build/runtime/build-queue';
import { requireAppRuntime } from '../../../packages/core/src/config/assembly/app-runtime';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir';
import { KITCHEN_SINK_REPRESENTATIVE_PAGES } from './lib/kitchen-sink-fixture';
import { loadStaticBuildBenchConfig } from './lib/static-build-fixture';

process.env.NODE_ENV = 'production';

const WARM_PAGES = Object.values(KITCHEN_SINK_REPRESENTATIVE_PAGES);

async function importPageDiskWarm(filePath: string): Promise<void> {
	const config = await loadStaticBuildBenchConfig();
	installBuildQueue(config);
	const loader = requireAppRuntime(config).moduleLoader;
	const outdir = path.join(resolveInternalExecutionDir(config), '.server-modules');

	await loader.importModule({
		filePath,
		outdir,
	});
}

const warmPagesPromise = Promise.all(WARM_PAGES.map((page) => importPageDiskWarm(page)));

export async function registerBuildSpeedBench(): Promise<void> {
	await warmPagesPromise;

	group('build-speed-bench', () => {
		bench('kitchen-sink warm route-module import (index.kita.tsx)', async () => {
			await importPageDiskWarm(KITCHEN_SINK_REPRESENTATIVE_PAGES.index);
		});

		bench('kitchen-sink warm route-module import (all integrations sample)', async () => {
			await Promise.all(WARM_PAGES.map((page) => importPageDiskWarm(page)));
		});
	});
}
