import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	constructorArgs: [] as Array<{ rootDir: string; buildExecutor: unknown }>,
	importModule: vi.fn(),
	invalidate: vi.fn(),
	dispose: vi.fn(async () => undefined),
}));

vi.mock('./server-module-transpiler.service.ts', () => ({
	ServerModuleTranspiler: class {
		constructor(args: { rootDir: string; buildExecutor: unknown }) {
			mocks.constructorArgs.push(args);
		}

		importModule = mocks.importModule;
		invalidate = mocks.invalidate;
		dispose = mocks.dispose;
	},
}));

import { TranspilerServerLoader } from './server-loader.service.ts';

describe('TranspilerServerLoader', () => {
	it('loads config through the bootstrap transpiler context', async () => {
		mocks.constructorArgs.length = 0;
		mocks.importModule.mockResolvedValueOnce({ default: { ok: true } });

		const loader = new TranspilerServerLoader({
			rootDir: '/bootstrap-app',
			buildExecutor: { build: vi.fn() },
		});

		await loader.loadConfig({
			filePath: '/bootstrap-app/eco.config.ts',
			outdir: '/bootstrap-app/.eco/.server-config',
		});

		expect(mocks.constructorArgs).toEqual([
			expect.objectContaining({
				rootDir: '/bootstrap-app',
			}),
		]);
		expect(mocks.importModule).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: '/bootstrap-app/eco.config.ts',
				outdir: '/bootstrap-app/.eco/.server-config',
			}),
		);
	});

	it('rebinding app context routes app loads through a new transpiler instance', async () => {
		mocks.constructorArgs.length = 0;
		mocks.importModule.mockResolvedValueOnce({});

		const loader = new TranspilerServerLoader({
			rootDir: '/bootstrap-app',
			buildExecutor: { build: vi.fn() },
		});

		loader.rebindAppContext({
			rootDir: '/app',
			buildExecutor: { build: vi.fn() },
		});

		await loader.loadApp({
			filePath: '/app/app.ts',
			outdir: '/app/.eco/.server-entry',
		});

		expect(mocks.constructorArgs).toEqual([
			expect.objectContaining({ rootDir: '/bootstrap-app' }),
			expect.objectContaining({ rootDir: '/app' }),
		]);
		expect(mocks.importModule).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: '/app/app.ts',
				outdir: '/app/.eco/.server-entry',
			}),
		);
	});

	it('forwards invalidate and dispose to owned transpiler instances', async () => {
		mocks.constructorArgs.length = 0;
		mocks.invalidate.mockClear();
		mocks.dispose.mockClear();

		const loader = new TranspilerServerLoader({
			rootDir: '/bootstrap-app',
			buildExecutor: { build: vi.fn() },
		});

		loader.rebindAppContext({
			rootDir: '/app',
			buildExecutor: { build: vi.fn() },
		});

		loader.invalidate();
		await loader.dispose();

		expect(mocks.invalidate).toHaveBeenCalledTimes(2);
		expect(mocks.dispose).toHaveBeenCalledTimes(2);
	});
});
