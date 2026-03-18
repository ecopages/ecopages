import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	build: vi.fn(),
	hash: vi.fn(() => 'hash123'),
}));

vi.mock('@ecopages/file-system', () => ({
	fileSystem: {
		hash: mocks.hash,
	},
}));

vi.mock('../build/build-adapter.ts', () => ({
	build: mocks.build,
	defaultBuildAdapter: {
		build: mocks.build,
	},
}));

import { PageModuleImportService } from './page-module-import.service.ts';

describe('PageModuleImportService', () => {
	afterEach(() => {
		vi.clearAllMocks();
		PageModuleImportService.clearImportCache();
		delete process.env.NODE_ENV;
	});

	it('should import the transpiled output in node runtimes', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export const value = 42; export default { ok: true };', 'utf8');
		mocks.build.mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: compiledOutput }],
		});

		try {
			const service = new PageModuleImportService();
			const result = await service.importModule<{ default: { ok: boolean }; value: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			expect(result.default).toEqual({ ok: true });
			expect(result.value).toBe(42);
			expect(mocks.build).toHaveBeenCalledWith(
				expect.objectContaining({
					entrypoints: ['/app/pages/page.tsx'],
					root: '/app',
					outdir: tempDir,
					naming: 'page-hash123.js',
				}),
				undefined,
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should throw the provided transpile error when the build fails', async () => {
		mocks.build.mockResolvedValue({
			success: false,
			logs: [{ message: 'Unexpected token' }],
			outputs: [],
		});

		const service = new PageModuleImportService();

		await expect(
			service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: '/tmp/out',
				transpileErrorMessage: (details) => `transpile failed: ${details}`,
			}),
		).rejects.toThrow('transpile failed: Unexpected token');
	});

	it('should keep a stable node module path in development for unchanged files', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-dev-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		mocks.build.mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: compiledOutput }],
		});

		try {
			const service = new PageModuleImportService();
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			expect(mocks.build).toHaveBeenCalledWith(
				expect.objectContaining({
					naming: 'page-hash123.js',
					externalPackages: true,
				}),
				undefined,
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should allow callers to opt back into bundled node imports explicitly', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-bundled-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		mocks.build.mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: compiledOutput }],
		});

		try {
			const service = new PageModuleImportService();
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				externalPackages: false,
			});

			expect(mocks.build).toHaveBeenCalledWith(
				expect.objectContaining({
					externalPackages: false,
				}),
				undefined,
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reuse cached node modules across different output directories', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-cache-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		mocks.build.mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: compiledOutput }],
		});

		try {
			const service = new PageModuleImportService();

			const first = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'meta'),
			});

			const second = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'render'),
			});

			expect(first.default).toEqual({ ok: true });
			expect(second.default).toEqual({ ok: true });
			expect(mocks.build).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reload the same node module path after development graph invalidation', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-invalidate-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export const version = 1; export default { ok: true };', 'utf8');
		mocks.build.mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: compiledOutput }],
		});

		try {
			const service = new PageModuleImportService();

			const first = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			writeFileSync(compiledOutput, 'export const version = 2; export default { ok: true };', 'utf8');
			PageModuleImportService.invalidateDevelopmentGraph();

			const second = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			expect(first.version).toBe(1);
			expect(second.version).toBe(2);
			expect(mocks.build).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
