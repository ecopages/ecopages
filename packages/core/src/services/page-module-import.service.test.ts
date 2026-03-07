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
	defaultBuildAdapter: {
		build: mocks.build,
	},
}));

import { PageModuleImportService } from './page-module-import.service.ts';

describe('PageModuleImportService', () => {
	afterEach(() => {
		vi.clearAllMocks();
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
});
