import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BuildResult } from '../../build/build-adapter.js';
import { ServerModuleTranspiler, type ServerModuleImportDependency } from './server-module-transpiler.service.ts';

function createBuildResult(): BuildResult {
	return {
		success: true,
		logs: [],
		outputs: [],
	};
}

function createFakeImportService(): {
	dependency: ServerModuleImportDependency;
	calls: {
		importModule: Array<unknown>;
		invalidateDevelopmentGraph: number;
	};
	setResult(result: unknown): void;
} {
	const calls = {
		importModule: [] as Array<unknown>,
		invalidateDevelopmentGraph: 0,
	};
	let nextResult: unknown = undefined;

	return {
		dependency: {
			async importModule<T = unknown>(
				options: Parameters<ServerModuleImportDependency['importModule']>[0],
			): Promise<T> {
				calls.importModule.push(options);
				return nextResult as T;
			},
			invalidateDevelopmentGraph(): void {
				calls.invalidateDevelopmentGraph += 1;
			},
		},
		calls,
		setResult(result: unknown): void {
			nextResult = result;
		},
	};
}

describe('ServerModuleTranspiler', () => {
	it('injects app root dir and build executor into page module imports', async () => {
		const buildExecutor = { build: async () => createBuildResult() };
		const fakeImportService = createFakeImportService();
		fakeImportService.setResult({ default: { ok: true } });

		const service = new ServerModuleTranspiler({
			rootDir: '/app',
			getBuildExecutor: () => buildExecutor,
			pageModuleImportService: fakeImportService.dependency,
		});

		await service.importModule({
			filePath: '/app/src/pages/index.tsx',
			outdir: '/app/.eco/.server-modules',
		});

		assert.deepEqual(fakeImportService.calls.importModule, [
			{
				filePath: '/app/src/pages/index.tsx',
				outdir: '/app/.eco/.server-modules',
				rootDir: '/app',
				buildExecutor,
				invalidationVersion: undefined,
			},
		]);
	});

	it('supports explicit bootstrap root and executor without a full app config', async () => {
		const buildExecutor = { build: async () => createBuildResult() };
		const fakeImportService = createFakeImportService();
		fakeImportService.setResult({ default: { ok: true } });

		const service = new ServerModuleTranspiler({
			rootDir: '/bootstrap-app',
			getBuildExecutor: () => buildExecutor,
			pageModuleImportService: fakeImportService.dependency,
		});

		await service.importModule({
			filePath: '/bootstrap-app/eco.config.ts',
			outdir: '/bootstrap-app/.eco/.server-modules',
		});

		assert.deepEqual(fakeImportService.calls.importModule, [
			{
				filePath: '/bootstrap-app/eco.config.ts',
				outdir: '/bootstrap-app/.eco/.server-modules',
				rootDir: '/bootstrap-app',
				buildExecutor,
				invalidationVersion: undefined,
			},
		]);
	});

	it('invalidates the owned import graph when no app invalidation callback is provided', () => {
		const fakeImportService = createFakeImportService();

		const service = new ServerModuleTranspiler({
			rootDir: '/bootstrap-app',
			getBuildExecutor: () => ({ build: async () => createBuildResult() }),
			pageModuleImportService: fakeImportService.dependency,
		});

		service.invalidate(['/bootstrap-app/src/pages/index.tsx']);

		assert.equal(fakeImportService.calls.invalidateDevelopmentGraph, 1);
	});
});
