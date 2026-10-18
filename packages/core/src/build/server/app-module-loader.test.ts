import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BuildQueue } from '../../build/runtime/build-queue.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { AppModuleLoader } from './app-module-loader.service.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';

function createFakeImportService(): {
	dependency: {
		importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T>;
		invalidateDevelopmentGraph(): void;
		getDevelopmentGeneration(): number;
	};
	calls: PageModuleBuildImportOptions[];
} {
	const calls: PageModuleBuildImportOptions[] = [];
	const dependency = {
		async importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T> {
			calls.push(options);
			return undefined as T;
		},
		invalidateDevelopmentGraph(): void {},
		getDevelopmentGeneration(): number {
			return 0;
		},
	};

	return { dependency, calls };
}

describe('AppModuleLoader', () => {
	it('uses its app root and build queue for each server-module import', async () => {
		const buildQueue = { build: async () => ({}) } as unknown as BuildQueue;
		const appConfig = {
			rootDir: '/app',
			appRuntime: { buildQueue },
		} as unknown as EcoPagesAppConfig;
		const fakeImportService = createFakeImportService();
		const loader = new AppModuleLoader(appConfig, fakeImportService.dependency);

		await loader.importModule({
			filePath: '/app/src/pages/index.tsx',
			outdir: '/app/.eco/.server-modules',
		});

		assert.deepEqual(fakeImportService.calls, [
			{
				filePath: '/app/src/pages/index.tsx',
				outdir: '/app/.eco/.server-modules',
				rootDir: '/app',
				buildExecutor: buildQueue,
			},
		]);
	});

	it('uses one app config for development generation changes', () => {
		let generation = 0;
		const appConfig = { rootDir: '/app' } as EcoPagesAppConfig;
		const fakeImportService = createFakeImportService();
		fakeImportService.dependency.getDevelopmentGeneration = () => generation;
		fakeImportService.dependency.invalidateDevelopmentGraph = () => {
			generation += 1;
		};
		const loader = new AppModuleLoader(appConfig, fakeImportService.dependency);

		assert.equal(loader.getDevelopmentGeneration(), 0);
		loader.invalidateDevelopmentGraph();
		assert.equal(loader.getDevelopmentGeneration(), 1);
	});
});
