import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * @remarks
 * Loads the scanner with `node:path` swapped for `path.win32`, and a glob that answers with
 * backslash-separated paths as `node:fs/promises.glob()` does on Windows.
 */
describe('ContentScanner with Windows content paths', () => {
	const contentRoot = 'D:\\app\\content';
	const schema = {
		'~standard': {
			version: 1 as const,
			vendor: 'test',
			validate: (value: unknown) => ({ value: value as { title: string } }),
		},
	};

	async function createWindowsScanner(files: string[]) {
		vi.resetModules();
		vi.doMock('node:path', async (importOriginal) => {
			const { win32 } = await importOriginal<typeof import('node:path')>();
			return { ...win32, default: win32 };
		});
		const { fileSystem } = await import('@ecopages/file-system');
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(files);
		const readFile = vi.spyOn(fileSystem, 'readFile').mockResolvedValue('---\ntitle: Entry\n---\n# Entry');
		const { ContentScanner } = await import('../content-scanner.ts');
		return { scanner: new ContentScanner({ contentRoot, schema }), readFile };
	}

	afterEach(() => {
		vi.restoreAllMocks();
		vi.doUnmock('node:path');
		vi.resetModules();
	});

	test('derives / slugs from nested entries and reads them from native paths', async () => {
		const { scanner, readFile } = await createWindowsScanner(['guides\\setup.mdx', 'intro.mdx']);

		const manifest = await scanner.getManifest();

		expect(manifest.map(({ slug, segments }) => ({ slug, segments }))).toEqual([
			{ slug: 'guides/setup', segments: ['guides', 'setup'] },
			{ slug: 'intro', segments: ['intro'] },
		]);
		expect(readFile).toHaveBeenCalledWith(`${contentRoot}\\guides\\setup.mdx`);
	});

	test('keeps the slug of a changed nested entry', async () => {
		const { scanner } = await createWindowsScanner(['guides\\setup.mdx']);
		await scanner.getManifest();

		const result = await scanner.updateEntryForPath(`${contentRoot}\\guides\\setup.mdx`, 'change');

		expect(result).not.toBe('structure');
		expect((await scanner.getManifest()).map(({ slug }) => slug)).toEqual(['guides/setup']);
	});
});
