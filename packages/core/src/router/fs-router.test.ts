import { describe, expect, test, mock } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR } from '../../fixtures/constants.ts';
import { ConfigBuilder } from '../config/config-builder.ts';
import type { Route, Routes } from '../internal-types.ts';
import { FSRouter } from './fs-router.ts';
import { FSRouterScanner } from './fs-router-scanner.ts';

const {
	templatesExt,
	absolutePaths: { pagesDir, distDir },
} = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const scanner = new FSRouterScanner({
	dir: pagesDir,
	// @ts-expect-error
	appConfig: {},
	origin: 'http://localhost:3000',
	templatesExt,
	options: {
		buildMode: false,
	},
});

const router = new FSRouter({
	origin: 'http://localhost:3000',
	assetPrefix: distDir,
	scanner,
});

await router.init();

describe('FSRouter', async () => {
	describe('init', async () => {
		test('should scan and return routes', async () => {
			expect(Object.keys(router.routes).length).toBe(5);
		});
	});

	describe('getDynamicParams', async () => {
		test.each([
			['/products/[id]', '/products/123', { id: '123' }],
			['/products/[id]', '/products/123/456', { id: '123' }],
			['/products/[id]', '/products/123/456/789', { id: '123' }],
		])(
			'dynamic route %p with URL %p should have dynamic params %p',
			async (dynamicPathname, pathname, expected) => {
				const route: Route = {
					filePath: '',
					kind: 'dynamic',
					pathname: dynamicPathname,
				};
				const params = router.getDynamicParams(route, pathname);

				expect(params).toEqual(expected);
			},
		);

		test.each([
			['/products/[...id]', '/products/123/456/789', { id: ['123', '456', '789'] }],
			['/products/[...id]', '/products/123', { id: ['123'] }],
			['/products/[...id]', '/products', { id: [] }],
		])(
			'catch-all route %p with URL %p should have dynamic params %p',
			async (catchAllRoute, pathname, expected) => {
				const route: Route = {
					filePath: '',
					kind: 'dynamic',
					pathname: catchAllRoute,
				};
				const params = router.getDynamicParams(route, pathname);

				expect(params).toEqual(expected);
			},
		);
	});

	describe('getSearchParams', () => {
		test('should extract query parameters from URL', () => {
			const url = new URL('http://localhost:3000/page?foo=bar&baz=qux');
			const params = router.getSearchParams(url);

			expect(params).toEqual({ foo: 'bar', baz: 'qux' });
		});

		test('should return empty object for URL without query params', () => {
			const url = new URL('http://localhost:3000/page');
			const params = router.getSearchParams(url);

			expect(params).toEqual({});
		});
	});

	describe('match', () => {
		const createRouterWithRoutes = (routes: Routes) => {
			const mockScanner = { scan: async () => routes } as unknown as FSRouterScanner;
			const testRouter = new FSRouter({
				origin: 'http://localhost:3000',
				assetPrefix: '/dist',
				scanner: mockScanner,
			});
			testRouter.routes = routes;
			return testRouter;
		};

		test('should match exact route', () => {
			const testRouter = createRouterWithRoutes({
				'/about': { filePath: '/pages/about.ts', kind: 'exact', pathname: '/about' },
			});

			const result = testRouter.match('http://localhost:3000/about');

			expect(result).not.toBeNull();
			expect(result?.kind).toBe('exact');
			expect(result?.pathname).toBe('/about');
		});

		test('should match exact route with trailing slash', () => {
			const testRouter = createRouterWithRoutes({
				'/about': { filePath: '/pages/about.ts', kind: 'exact', pathname: '/about' },
			});

			const result = testRouter.match('http://localhost:3000/about/');

			expect(result).not.toBeNull();
			expect(result?.kind).toBe('exact');
		});

		test('should match dynamic route', () => {
			const testRouter = createRouterWithRoutes({
				'/dynamic/[id]': { filePath: '/pages/dynamic/[id].ts', kind: 'dynamic', pathname: '/dynamic/[id]' },
			});

			const result = testRouter.match('http://localhost:3000/dynamic/123');

			expect(result).not.toBeNull();
			expect(result?.kind).toBe('dynamic');
			expect(result?.params).toEqual({ id: '123' });
		});

		test('should match catch-all route', () => {
			const testRouter = createRouterWithRoutes({
				'/catch-all/[...slug]': {
					filePath: '/pages/catch-all/[...slug].ts',
					kind: 'catch-all',
					pathname: '/catch-all/[...slug]',
				},
			});

			const result = testRouter.match('http://localhost:3000/catch-all/a/b/c');

			expect(result).not.toBeNull();
			expect(result?.kind).toBe('catch-all');
			expect(result?.params).toEqual({ slug: ['a', 'b', 'c'] });
		});

		test('should include query params in match result', () => {
			const testRouter = createRouterWithRoutes({
				'/page': { filePath: '/pages/page.ts', kind: 'exact', pathname: '/page' },
			});

			const result = testRouter.match('http://localhost:3000/page?sort=asc&page=2');

			expect(result?.query).toEqual({ sort: 'asc', page: '2' });
		});

		test('should return null for non-matching route', () => {
			const testRouter = createRouterWithRoutes({
				'/about': { filePath: '/pages/about.ts', kind: 'exact', pathname: '/about' },
			});

			const result = testRouter.match('http://localhost:3000/contact');

			expect(result).toBeNull();
		});

		test('should prefer exact match over dynamic', () => {
			const testRouter = createRouterWithRoutes({
				'/blog/latest': { filePath: '/pages/blog/latest.ts', kind: 'exact', pathname: '/blog/latest' },
				'/blog/[slug]': { filePath: '/pages/blog/[slug].ts', kind: 'dynamic', pathname: '/blog/[slug]' },
			});

			const result = testRouter.match('http://localhost:3000/blog/latest');

			expect(result?.kind).toBe('exact');
		});
	});

	describe('setOnReload and reload', () => {
		test('should set and call onReload callback', async () => {
			const mockScanner = { scan: async () => ({}) } as unknown as FSRouterScanner;
			const testRouter = new FSRouter({
				origin: 'http://localhost:3000',
				assetPrefix: '/dist',
				scanner: mockScanner,
			});

			const callback = mock(() => {});
			testRouter.setOnReload(callback);
			testRouter.reload();

			expect(callback).toHaveBeenCalledTimes(1);
		});
	});
});
