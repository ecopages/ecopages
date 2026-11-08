import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';

/**
 * @remarks
 * Loads the registry with the Windows flavor of `@ecopages/file-system/path`, so the Windows route
 * derivation runs on any OS. The glob answers with `/` separators, as `fileSystem.glob()` does on every host.
 */
describe('RouteRegistry with Windows page paths', () => {
	const pagesDir = 'D:/app/src/pages';

	async function scanWindowsPages(files: string[]) {
		vi.resetModules();
		vi.doMock('@ecopages/file-system/path', async (importOriginal) => {
			const actual = await importOriginal<typeof import('@ecopages/file-system/path')>();
			return { ...actual, path: actual.createPath('win32') };
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
		vi.doUnmock('@ecopages/file-system/path');
		vi.resetModules();
	});

	test('derives URL pathnames from nested page files', async () => {
		const registry = await scanWindowsPages([
			'index.ts',
			'blog/index.ts',
			'docs/getting-started.ts',
			'kita-dynamic/[slug].kita.tsx',
			'files/[...path].ts',
		]);

		expect(registry.templateRoutes.map(({ pathname, filePath }) => ({ pathname, filePath }))).toEqual([
			{ pathname: '/', filePath: `${pagesDir}/index.ts` },
			{ pathname: '/blog', filePath: `${pagesDir}/blog/index.ts` },
			{ pathname: '/docs/getting-started', filePath: `${pagesDir}/docs/getting-started.ts` },
			{ pathname: '/kita-dynamic/[slug]', filePath: `${pagesDir}/kita-dynamic/[slug].kita.tsx` },
			{ pathname: '/files/[...path]', filePath: `${pagesDir}/files/[...path].ts` },
		]);
	});

	test('matches a dynamic route request', async () => {
		const registry = await scanWindowsPages(['kita-dynamic/[slug].kita.tsx']);

		const match = registry.matchRequest('http://localhost:3000/kita-dynamic/alpha');

		expect(match?.templateRoute.pathname).toBe('/kita-dynamic/[slug]');
		expect(match?.params).toEqual({ slug: 'alpha' });
	});
});
