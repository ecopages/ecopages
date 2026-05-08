import { describe, expect, test, vi } from 'vitest';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.js';
import type { EcoPagesAppConfig } from '../../types/internal-types.js';
import { RouteRegistry, type RouteRegistryPageModuleAdapter, type TemplateRoute } from './route-registry.ts';

const {
	templatesExt,
	absolutePaths: { pagesDir },
	...appConfig
} = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

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
