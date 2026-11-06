import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * @remarks
 * Loads `ImageUtils` with `node:path` swapped for `path.win32`, so the Windows URL building runs on any OS.
 */
describe('ImageUtils.toPublicSrc with Windows paths', () => {
	async function importWithWin32Path() {
		vi.resetModules();
		vi.doMock('node:path', async (importOriginal) => {
			const { win32 } = await importOriginal<typeof import('node:path')>();
			return { ...win32, default: win32 };
		});
		return (await import('../image-utils.ts')).ImageUtils;
	}

	afterEach(() => {
		vi.doUnmock('node:path');
		vi.resetModules();
	});

	test('joins the public path and the file name with /', async () => {
		const ImageUtils = await importWithWin32Path();

		expect(ImageUtils.toPublicSrc('/assets/optimized', 'D:\\app\\dist\\assets\\optimized\\fc1781c3.webp')).toBe(
			'/assets/optimized/fc1781c3.webp',
		);
	});
});
