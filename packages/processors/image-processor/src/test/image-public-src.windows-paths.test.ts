import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * @remarks
 * Loads `toPublicImageSrc` with the Windows flavor of `@ecopages/file-system/path`, so the Windows URL building
 * runs on any OS.
 */
describe('toPublicImageSrc with Windows paths', () => {
	async function importWithWin32Path() {
		vi.resetModules();
		vi.doMock('@ecopages/file-system/path', async (importOriginal) => {
			const actual = await importOriginal<typeof import('@ecopages/file-system/path')>();
			return { ...actual, path: actual.createPath('win32') };
		});
		return (await import('../image-public-src.ts')).toPublicImageSrc;
	}

	afterEach(() => {
		vi.doUnmock('@ecopages/file-system/path');
		vi.resetModules();
	});

	test('joins the public path and the file name with /', async () => {
		const toPublicImageSrc = await importWithWin32Path();

		expect(toPublicImageSrc('/assets/optimized', 'D:/app/dist/assets/optimized/fc1781c3.webp')).toBe(
			'/assets/optimized/fc1781c3.webp',
		);
	});
});
