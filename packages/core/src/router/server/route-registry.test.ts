import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.js';
import { RouteRegistry, type RouteRegistryPageModuleAdapter, type TemplateRoute } from './route-registry.ts';

const {
	templatesExt,
	absolutePaths: { pagesDir },
	...appConfig
} = await createFixtureAppConfig();

const createRegistry = (overrides?: Partial<ConstructorParameters<typeof RouteRegistry>[0]>) =>
	new RouteRegistry({
		pagesDir,
		appConfig: appConfig as EcoPagesAppConfig,
		origin: 'http://localhost:3000',
		templatesExt,
		buildMode: false,
		pageModuleAdapter: {
			loadPageModule: vi.fn(async () => ({})),
		},
		...overrides,
	});

describe('RouteRegistry', () => {
	test('discovers canonical template routes', async () => {
		const registry = createRegistry();

		await registry.init();

		expect(registry.templateRoutes.map((route) => route.pathname)).toEqual([
			'/',
			'/404',
			'/500',
			'/postcss-hmr',
			'/dynamic/[slug]',
			'/catch-all/[...path]',
		]);
	});

	test.each([
		['/products/[id]', '/products/123', { id: '123' }],
		['/products/[...id]', '/products/123/456/789', { id: ['123', '456', '789'] }],
	])('matches template route %p against request %p', async (pathname, requestPathname, expectedParams) => {
		const registry = createRegistry();
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{
				pathname,
				kind: pathname.includes('[...') ? 'catch-all' : 'dynamic',
				filePath: '/pages/example.ts',
				paramNames: [],
			},
		];

		const result = registry.matchRequest(`http://localhost:3000${requestPathname}`);

		expect(result?.params).toEqual(expectedParams);
		expect(result?.templateRoute.pathname).toBe(pathname);
		expect(result?.requestedPathname).toBe(requestPathname);
	});

	test('includes query parameters in match results', async () => {
		const registry = createRegistry();
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{ pathname: '/page', kind: 'exact', filePath: '/pages/page.ts', paramNames: [] },
		];

		const result = registry.matchRequest('http://localhost:3000/page?sort=asc&page=2');

		expect(result?.query).toEqual({ sort: 'asc', page: '2' });
	});

	test('prefers exact routes over dynamic routes', async () => {
		const registry = createRegistry();
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{ pathname: '/blog/latest', kind: 'exact', filePath: '/pages/blog/latest.ts', paramNames: [] },
			{ pathname: '/blog/[slug]', kind: 'dynamic', filePath: '/pages/blog/[slug].ts', paramNames: ['slug'] },
		];

		const result = registry.matchRequest('http://localhost:3000/blog/latest');

		expect(result?.templateRoute.kind).toBe('exact');
	});

	test('prefers the most specific catch-all when several match one request', async () => {
		const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
		const files = [
			'docs/[...slug].ts',
			'docs/forms-react/[...slug].ts',
			'docs/[section]/[...slug].ts',
			'docs/[section]/forms/[...slug].ts',
			'docs/guides/[...slug].ts',
			'docs/x/[...slug].ts',
			'docs/exact.ts',
			'docs/[slug].ts',
		];

		try {
			for (const file of files) {
				const filePath = path.join(pagesDir, file);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, '');
			}

			const discoveredFiles = await fileSystem.glob(['**/*.ts'], { cwd: pagesDir });
			for (const fileOrder of [discoveredFiles, [...discoveredFiles].reverse()]) {
				const globSpy = vi.spyOn(fileSystem, 'glob').mockResolvedValue(fileOrder);
				try {
					const discovered = createRegistry({ pagesDir, templatesExt: ['.ts'] });
					await discovered.init();

					const scoped = discovered.matchRequest('http://localhost:3000/docs/forms-react/getting-started');
					expect(scoped?.templateRoute.pathname).toBe('/docs/forms-react/[...slug]');
					expect(scoped?.params).toEqual({ slug: ['getting-started'] });

					const dynamicPrefix = discovered.matchRequest('http://localhost:3000/docs/forms/getting-started');
					expect(dynamicPrefix?.templateRoute.pathname).toBe('/docs/[section]/[...slug]');
					expect(dynamicPrefix?.params).toEqual({ section: 'forms', slug: ['getting-started'] });

					const staticPrefix = discovered.matchRequest('http://localhost:3000/docs/x/getting-started');
					expect(staticPrefix?.templateRoute.pathname).toBe('/docs/x/[...slug]');

					const earlierStaticPrefix = discovered.matchRequest(
						'http://localhost:3000/docs/guides/forms/getting-started',
					);
					expect(earlierStaticPrefix?.templateRoute.pathname).toBe('/docs/guides/[...slug]');

					expect(discovered.matchRequest('http://localhost:3000/docs/exact')?.templateRoute.pathname).toBe(
						'/docs/exact',
					);
					expect(
						discovered.matchRequest('http://localhost:3000/docs/validation')?.templateRoute.pathname,
					).toBe('/docs/[slug]');
				} finally {
					globSpy.mockRestore();
				}
			}

			const genericPagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
			try {
				for (const file of files.slice(0, 2)) {
					const filePath = path.join(genericPagesDir, file);
					await fs.mkdir(path.dirname(filePath), { recursive: true });
					await fs.writeFile(filePath, '');
				}

				const genericRegistry = createRegistry({ pagesDir: genericPagesDir, templatesExt: ['.ts'] });
				await genericRegistry.init();
				const generic = genericRegistry.matchRequest('http://localhost:3000/docs/validation');
				expect(generic?.templateRoute.pathname).toBe('/docs/[...slug]');
				const general = genericRegistry.matchRequest('http://localhost:3000/docs/forms/validation');
				expect(general?.templateRoute.pathname).toBe('/docs/[...slug]');
			} finally {
				await fs.rm(genericPagesDir, { recursive: true, force: true });
			}
		} finally {
			await fs.rm(pagesDir, { recursive: true, force: true });
		}
	});

	test('fires reload listeners after reload', async () => {
		const registry = createRegistry();
		const listener = vi.fn();

		registry.onReload(listener);
		await registry.reload();

		expect(listener).toHaveBeenCalledTimes(1);
	});

	test('lists static path expansions lazily through the page module adapter', async () => {
		const pageModuleAdapter: RouteRegistryPageModuleAdapter = {
			loadPageModule: vi.fn(async () => ({
				staticProps: {},
				staticPaths: async () => ({ paths: [{ params: { slug: 'hello-world' } }] }),
			})),
		};

		const registry = createRegistry({ pageModuleAdapter, buildMode: true });
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{ pathname: '/blog/[slug]', kind: 'dynamic', filePath: '/pages/blog/[slug].ts', paramNames: ['slug'] },
		];

		const expansions = await registry.listStaticPathExpansions({ runtimeOrigin: 'http://localhost:3000' });

		expect(expansions).toEqual([
			{
				pathname: '/blog/hello-world',
				templateRoute: {
					pathname: '/blog/[slug]',
					kind: 'dynamic',
					filePath: '/pages/blog/[slug].ts',
					paramNames: ['slug'],
				},
				params: { slug: 'hello-world' },
			},
		]);
		expect(pageModuleAdapter.loadPageModule).toHaveBeenCalledWith('/pages/blog/[slug].ts');
	});

	test('lists static-generation routes through one registry seam', async () => {
		const pageModuleAdapter: RouteRegistryPageModuleAdapter = {
			loadPageModule: vi.fn(async () => ({
				staticProps: {},
				staticPaths: async () => ({ paths: [{ params: { slug: 'hello-world' } }] }),
			})),
		};

		const registry = createRegistry({ pageModuleAdapter, buildMode: true });
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{ pathname: '/', kind: 'exact', filePath: '/pages/index.ts', paramNames: [] },
			{ pathname: '/blog/[slug]', kind: 'dynamic', filePath: '/pages/blog/[slug].ts', paramNames: ['slug'] },
		];

		const routes = await registry.listStaticGenerationRoutes({ runtimeOrigin: 'http://localhost:3000' });

		expect(routes).toEqual([
			{
				requestUrl: 'http://localhost:3000/',
				pathname: '/',
				templateRoute: {
					pathname: '/',
					kind: 'exact',
					filePath: '/pages/index.ts',
					paramNames: [],
				},
				params: {},
			},
			{
				requestUrl: 'http://localhost:3000/blog/hello-world',
				pathname: '/blog/hello-world',
				templateRoute: {
					pathname: '/blog/[slug]',
					kind: 'dynamic',
					filePath: '/pages/blog/[slug].ts',
					paramNames: ['slug'],
				},
				params: { slug: 'hello-world' },
			},
		]);
	});
});
