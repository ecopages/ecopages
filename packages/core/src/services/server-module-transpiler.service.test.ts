import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	importModule: vi.fn(),
}));

vi.mock('./page-module-import.service.ts', () => ({
	PageModuleImportService: class {
		importModule = mocks.importModule;
	},
}));

import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

describe('ServerModuleTranspiler', () => {
	it('injects app root dir and build executor into page module imports', async () => {
		const buildExecutor = { build: vi.fn() };
		mocks.importModule.mockResolvedValueOnce({ default: { ok: true } });

		const service = new ServerModuleTranspiler({
			rootDir: '/app',
			buildExecutor,
		});

		await service.importModule({
			filePath: '/app/src/pages/index.tsx',
			outdir: '/app/.eco/.server-modules',
		});

		expect(mocks.importModule).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: '/app/src/pages/index.tsx',
				outdir: '/app/.eco/.server-modules',
				rootDir: '/app',
				buildExecutor,
			}),
		);
	});

	it('supports explicit bootstrap root and executor without a full app config', async () => {
		const buildExecutor = { build: vi.fn() };
		mocks.importModule.mockResolvedValueOnce({ default: { ok: true } });

		const service = new ServerModuleTranspiler({
			rootDir: '/bootstrap-app',
			buildExecutor,
		});

		await service.importModule({
			filePath: '/bootstrap-app/eco.config.ts',
			outdir: '/bootstrap-app/.eco/.server-modules',
		});

		expect(mocks.importModule).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: '/bootstrap-app/eco.config.ts',
				outdir: '/bootstrap-app/.eco/.server-modules',
				rootDir: '/bootstrap-app',
				buildExecutor,
			}),
		);
	});
});