import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';

/**
 * @remarks
 * Loads the registry with `node:path` swapped for `path.win32`, and a glob that answers with
 * backslash-separated paths as `node:fs/promises.glob()` does on Windows, so the Windows route
 * derivation runs on any OS.
 */
describe('RouteRegistry with Windows page paths', () => {
	const pagesDir = 'D:\\app\\src\\pages';

	async function scanWindowsPages(files: string[]) {
		vi.resetModules();
		vi.doMock('node:path', async (importOriginal) => {
			const { win32 } = await importOriginal<typeof import('node:path')>();
			return { ...win32, default: win32 };
		});
		const { fileSystem } = await import('@ecopages/file-system');
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(files);
		const { RouteRegistry } = await import('./route-registry.ts');

		const registry = new RouteRegistry({
			pagesDir,
			appConfig: { integrations: [] } as unknown as EcoPagesAppConfig,
			origin: 'http://localhost:3000',
			templatesExt: ['.kita.tsx', '.ts'],
			buildMode: false,
			pageModuleAdapter: { loadPageModule: async () => ({}) },
		});
		await registry.init();
		return registry;
	}

	afterEach(() => {
		vi.restoreAllMocks();
		vi.doUnmock('node:path');
		vi.resetModules();
	});

	test('derives URL pathnames from nested page files', async () => {
		const registry = await scanWindowsPages([
			'index.ts',
			'blog\\index.ts',
			'docs\\getting-started.ts',
			'kita-dynamic\\[slug].kita.tsx',
			'files\\[...path].ts',
		]);

		expect(registry.templateRoutes.map(({ pathname, filePath }) => ({ pathname, filePath }))).toEqual([
			{ pathname: '/', filePath: `${pagesDir}\\index.ts` },
			{ pathname: '/blog', filePath: `${pagesDir}\\blog\\index.ts` },
			{ pathname: '/docs/getting-started', filePath: `${pagesDir}\\docs\\getting-started.ts` },
			{ pathname: '/kita-dynamic/[slug]', filePath: `${pagesDir}\\kita-dynamic\\[slug].kita.tsx` },
			{ pathname: '/files/[...path]', filePath: `${pagesDir}\\files\\[...path].ts` },
		]);
	});

	test('matches a dynamic route request', async () => {
		const registry = await scanWindowsPages(['kita-dynamic\\[slug].kita.tsx']);

		const match = registry.matchRequest('http://localhost:3000/kita-dynamic/alpha');

		expect(match?.templateRoute.pathname).toBe('/kita-dynamic/[slug]');
		expect(match?.params).toEqual({ slug: 'alpha' });
	});
});
