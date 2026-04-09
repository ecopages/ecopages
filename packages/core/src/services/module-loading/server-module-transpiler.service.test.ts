import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BuildResult } from '../../build/build-adapter.js';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { CounterServerInvalidationState } from '../runtime-state/server-invalidation-state.service.ts';
import { getAppModuleLoader, setAppHostModuleLoader } from './app-server-module-transpiler.service.ts';
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

	it('forwards an abstract host module loader into the default page import service', () => {
		const hostModuleLoader = async (_id: string) => ({ default: { ok: true } });
		const service = new ServerModuleTranspiler({
			rootDir: '/bootstrap-app',
			getBuildExecutor: () => ({ build: async () => createBuildResult() }),
			getHostModuleLoader: () => hostModuleLoader,
		});

		const internal = service as unknown as {
			pageModuleImportService: { dependencies: { getHostModuleLoader: () => unknown } };
		};

		assert.equal(internal.pageModuleImportService.dependencies.getHostModuleLoader(), hostModuleLoader);
	});

	it('reuses one app-owned module loader per app config', () => {
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				pagesDir: '/app/src/pages',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				componentsDir: '/app/src/components',
			},
			templatesExt: ['.tsx'],
			runtime: {},
		} as unknown as EcoPagesAppConfig;

		const firstLoader = getAppModuleLoader(appConfig);
		const secondLoader = getAppModuleLoader(appConfig);

		assert.equal(firstLoader, secondLoader);
		assert.equal(firstLoader.owner, 'bun');
	});

	it('reflects host ownership on the app-owned module loader after runtime wiring changes', () => {
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				pagesDir: '/app/src/pages',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				componentsDir: '/app/src/components',
			},
			templatesExt: ['.tsx'],
			runtime: {},
		} as unknown as EcoPagesAppConfig;
		const moduleLoader = getAppModuleLoader(appConfig);

		setAppHostModuleLoader(appConfig, async () => ({ default: { ok: true } }));

		assert.equal(moduleLoader.owner, 'host');
	});

	it('applies the app invalidation version to app-owned module imports', async () => {
		const calls: Array<unknown> = [];
		const buildExecutor = { build: async () => createBuildResult() };
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				pagesDir: '/app/src/pages',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				componentsDir: '/app/src/components',
			},
			templatesExt: ['.tsx'],
			runtime: {
				buildExecutor,
				serverInvalidationState: new CounterServerInvalidationState(),
			},
		} as unknown as EcoPagesAppConfig;

		const moduleLoader = getAppModuleLoader(appConfig) as unknown as {
			pageModuleImportService: {
				importModule: <T = unknown>(options: unknown) => Promise<T>;
			};
		};

		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async <T = unknown>(options: unknown): Promise<T> => {
			calls.push(options);
			return { default: { ok: true } } as T;
		};

		appConfig.runtime!.serverInvalidationState!.invalidateServerModules(['/app/src/includes/seo.kita.tsx']);

		await getAppModuleLoader(appConfig).importModule({
			filePath: '/app/src/includes/html.kita.tsx',
			rootDir: '/app',
			outdir: '/app/.eco/.server-modules',
		});

		moduleLoader.pageModuleImportService.importModule = originalImportModule;

		assert.deepEqual(calls, [
			{
				filePath: '/app/src/includes/html.kita.tsx',
				rootDir: '/app',
				outdir: '/app/.eco/.server-modules',
				buildExecutor,
				invalidationVersion: 1,
			},
		]);
	});
});
