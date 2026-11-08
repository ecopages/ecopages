import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * @remarks
 * Loads the scanner with the Windows flavor of `@ecopages/file-system/path`. The glob answers with `/`
 * separators, as `fileSystem.glob()` does on every host.
 */
describe('ContentScanner with Windows content paths', () => {
	const contentRoot = 'D:/app/content';
	const schema = {
		'~standard': {
			version: 1 as const,
			vendor: 'test',
			validate: (value: unknown) => ({ value: value as { title: string } }),
		},
	};

	async function createWindowsScanner(files: string[]) {
		vi.resetModules();
		vi.doMock('@ecopages/file-system/path', async (importOriginal) => {
			const actual = await importOriginal<typeof import('@ecopages/file-system/path')>();
			return { ...actual, path: actual.createPath('win32') };
		});
		const { fileSystem } = await import('@ecopages/file-system');
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(files);
		const readFile = vi.spyOn(fileSystem, 'readFile').mockResolvedValue('---\ntitle: Entry\n---\n# Entry');
		const { ContentScanner } = await import('../content-scanner.ts');
		return { scanner: new ContentScanner({ contentRoot, schema }), readFile };
	}

	afterEach(() => {
		vi.restoreAllMocks();
		vi.doUnmock('@ecopages/file-system/path');
		vi.resetModules();
	});

	test('derives / slugs from nested entries and reads them by their full path', async () => {
		const { scanner, readFile } = await createWindowsScanner(['guides/setup.mdx', 'intro.mdx']);

		const manifest = await scanner.getManifest();

		expect(manifest.map(({ slug, segments }) => ({ slug, segments }))).toEqual([
			{ slug: 'guides/setup', segments: ['guides', 'setup'] },
			{ slug: 'intro', segments: ['intro'] },
		]);
		expect(readFile).toHaveBeenCalledWith(`${contentRoot}/guides/setup.mdx`);
	});

	test('keeps the slug of a changed nested entry', async () => {
		const { scanner } = await createWindowsScanner(['guides/setup.mdx']);
		await scanner.getManifest();

		const result = await scanner.updateEntryForPath(`${contentRoot}/guides/setup.mdx`, 'change');

		expect(result).not.toBe('structure');
		expect((await scanner.getManifest()).map(({ slug }) => slug)).toEqual(['guides/setup']);
	});
});
