import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BuildResult } from '../../build/build-adapter.js';
import {
	TranspilerServerLoader,
	type ServerLoaderDependencyFactory,
	type ServerLoaderTranspilerDependency,
} from './server-loader.service.ts';
import type { ServerModuleTranspilerBootstrapArgs } from './server-module-transpiler.service.ts';

function createBuildResult(): BuildResult {
	return {
		success: true,
		logs: [],
		outputs: [],
	};
}

function createFakeTranspilerFactory(): {
	factory: ServerLoaderDependencyFactory;
	constructorArgs: ServerModuleTranspilerBootstrapArgs[];
	importCalls: Array<unknown>;
	invalidateCalls: Array<string[] | undefined>;
	disposeCalls: number;
	setNextImportResult(result: unknown): void;
} {
	const constructorArgs: ServerModuleTranspilerBootstrapArgs[] = [];
	const importCalls: Array<unknown> = [];
	const invalidateCalls: Array<string[] | undefined> = [];
	let disposeCalls = 0;
	let nextImportResult: unknown = undefined;

	return {
		factory: {
			createTranspiler(context): ServerLoaderTranspilerDependency {
				constructorArgs.push(context);

				return {
					async importModule<T = unknown>(
						options: Parameters<ServerLoaderTranspilerDependency['importModule']>[0],
					): Promise<T> {
						importCalls.push(options);
						return nextImportResult as T;
					},
					invalidate(changedFiles?: string[]): void {
						invalidateCalls.push(changedFiles);
					},
					async dispose(): Promise<void> {
						disposeCalls += 1;
					},
				};
			},
		},
		constructorArgs,
		importCalls,
		invalidateCalls,
		get disposeCalls() {
			return disposeCalls;
		},
		setNextImportResult(result: unknown): void {
			nextImportResult = result;
		},
	};
}

describe('TranspilerServerLoader', () => {
	it('loads config through the bootstrap transpiler context', async () => {
		const fakeFactory = createFakeTranspilerFactory();
		const buildExecutor = { build: async () => createBuildResult() };
		fakeFactory.setNextImportResult({ default: { ok: true } });

		const loader = new TranspilerServerLoader(
			{
				rootDir: '/bootstrap-app',
				getBuildExecutor: () => buildExecutor,
			},
			fakeFactory.factory,
		);

		await loader.loadConfig({
			filePath: '/bootstrap-app/eco.config.ts',
			outdir: '/bootstrap-app/.eco/.server-config',
		});

		assert.deepEqual(fakeFactory.constructorArgs, [
			{
				rootDir: '/bootstrap-app',
				getBuildExecutor: fakeFactory.constructorArgs[0]?.getBuildExecutor,
			},
		]);
		assert.deepEqual(fakeFactory.constructorArgs[0]?.getBuildExecutor(), buildExecutor);
		assert.deepEqual(fakeFactory.importCalls, [
			{
				filePath: '/bootstrap-app/eco.config.ts',
				outdir: '/bootstrap-app/.eco/.server-config',
			},
		]);
	});

	it('rebinding app context routes app loads through a new transpiler instance', async () => {
		const fakeFactory = createFakeTranspilerFactory();
		const bootstrapBuildExecutor = { build: async () => createBuildResult() };
		const appBuildExecutor = { build: async () => createBuildResult() };
		fakeFactory.setNextImportResult({});

		const loader = new TranspilerServerLoader(
			{
				rootDir: '/bootstrap-app',
				getBuildExecutor: () => bootstrapBuildExecutor,
			},
			fakeFactory.factory,
		);

		loader.rebindAppContext({
			rootDir: '/app',
			getBuildExecutor: () => appBuildExecutor,
		});

		await loader.loadApp({
			filePath: '/app/app.ts',
			outdir: '/app/.eco/.server-entry',
		});

		assert.equal(fakeFactory.constructorArgs.length, 2);
		assert.equal(fakeFactory.constructorArgs[0]?.rootDir, '/bootstrap-app');
		assert.equal(fakeFactory.constructorArgs[1]?.rootDir, '/app');
		assert.deepEqual(fakeFactory.constructorArgs[0]?.getBuildExecutor(), bootstrapBuildExecutor);
		assert.deepEqual(fakeFactory.constructorArgs[1]?.getBuildExecutor(), appBuildExecutor);
		assert.deepEqual(fakeFactory.importCalls, [
			{
				filePath: '/app/app.ts',
				outdir: '/app/.eco/.server-entry',
			},
		]);
	});

	it('forwards invalidate and dispose to owned transpiler instances', async () => {
		const fakeFactory = createFakeTranspilerFactory();
		const bootstrapBuildExecutor = { build: async () => createBuildResult() };
		const appBuildExecutor = { build: async () => createBuildResult() };

		const loader = new TranspilerServerLoader(
			{
				rootDir: '/bootstrap-app',
				getBuildExecutor: () => bootstrapBuildExecutor,
			},
			fakeFactory.factory,
		);

		loader.rebindAppContext({
			rootDir: '/app',
			getBuildExecutor: () => appBuildExecutor,
		});

		loader.invalidate();
		await loader.dispose();

		assert.deepEqual(fakeFactory.invalidateCalls, [undefined, undefined]);
		assert.equal(fakeFactory.disposeCalls, 2);
	});
});
