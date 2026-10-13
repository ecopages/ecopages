import { describe, expect, test, vi } from 'vitest';
import type { EcoPageComponent, StaticRoute, ViewLoader } from '../../../types/public-types.ts';
import { ExplicitStaticRouteMatcher } from './explicit-static-route-matcher.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { appLogger } from '../../../global/app-logger.ts';

function createMockView(integration = 'string'): EcoPageComponent<any> {
	const view = (() => '<div>Test</div>') as EcoPageComponent<any>;
	view.config = {
		integration,
		identity: { id: 'test', file: '/test/-view.ts', integration },
	};
	return view;
}

function createMockLoader(view?: EcoPageComponent<any>): ViewLoader<any> {
	const actualView = view ?? createMockView();
	return () => Promise.resolve({ default: actualView });
}

function createMockRoute(path: string, view?: EcoPageComponent<any>): StaticRoute {
	return {
		path,
		loader: createMockLoader(view),
	};
}

function createMatcher(staticRoutes: StaticRoute[]) {
	return new ExplicitStaticRouteMatcher({
		appConfig: { baseUrl: 'http://localhost:3000' } as any,
		routeRendererFactory: {} as any,
		staticRoutes,
	});
}

describe('ExplicitStaticRouteMatcher', () => {
	describe('match', () => {
		test.each([
			{ pattern: '/about', url: '/about', params: {} },
			{ pattern: '/', url: '/', params: {} },
			{ pattern: '/docs/getting-started', url: '/docs/getting-started', params: {} },
			{ pattern: '/blog/:slug', url: '/blog/hello-world', params: { slug: 'hello-world' } },
			{
				pattern: '/blog/:year/:month/:slug',
				url: '/blog/2024/01/hello-world',
				params: { year: '2024', month: '01', slug: 'hello-world' },
			},
			{ pattern: '/users/:id/posts', url: '/users/123/posts', params: { id: '123' } },
			{ pattern: '/blog/[slug]', url: '/blog/hello-world', params: { slug: 'hello-world' } },
			{
				pattern: '/products/[category]/[id]',
				url: '/products/electronics/12345',
				params: { category: 'electronics', id: '12345' },
			},
			{
				pattern: '/docs/[...path]',
				url: '/docs/api/reference/components',
				params: { path: 'api/reference/components' },
			},
			{
				pattern: '/files/:...path',
				url: '/files/images/2024/photo.jpg',
				params: { path: 'images/2024/photo.jpg' },
			},
			{ pattern: '/docs/[...path]', url: '/docs/intro', params: { path: 'intro' } },
			{ pattern: '/search', url: '/search?q=test&page=1', params: {} },
			{ pattern: '/docs/intro', url: '/docs/intro#section-1', params: {} },
			{ pattern: '/about', url: '/about/', params: {} },
		])('matches $pattern against $url', ({ pattern, url, params }) => {
			const matcher = createMatcher([createMockRoute(pattern)]);

			const result = matcher.match(`http://localhost:3000${url}`);

			expect(result?.route.path).toBe(pattern);
			expect(result?.params).toEqual(params);
		});

		test.each([
			{ name: 'a different path', routes: ['/about'], url: '/contact' },
			{ name: 'a longer path than the route', routes: ['/about'], url: '/about/team' },
			{ name: 'an empty route list', routes: [], url: '/anything' },
		])('returns null for $name', ({ routes, url }) => {
			const matcher = createMatcher(routes.map((route) => createMockRoute(route)));

			expect(matcher.match(`http://localhost:3000${url}`)).toBeNull();
		});
	});

	describe('route priority', () => {
		test('should match first route when multiple routes match', () => {
			const aboutView = createMockView();
			const catchAllView = createMockView();

			const matcher = createMatcher([
				createMockRoute('/about', aboutView),
				createMockRoute('/[...path]', catchAllView),
			]);

			const result = matcher.match('http://localhost:3000/about');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/about');
		});

		test('should match an exact route registered before a dynamic route', () => {
			const matcher = createMatcher([
				createMockRoute('/blog/featured', createMockView()),
				createMockRoute('/blog/:slug', createMockView()),
			]);

			const result = matcher.match('http://localhost:3000/blog/featured');

			expect(result?.route.path).toBe('/blog/featured');
			expect(result?.params).toEqual({});
		});

		test('should match a dynamic route registered before a more specific exact route', () => {
			const matcher = createMatcher([
				createMockRoute('/blog/:slug', createMockView()),
				createMockRoute('/blog/featured', createMockView()),
			]);

			const result = matcher.match('http://localhost:3000/blog/featured');

			expect(result?.route.path).toBe('/blog/:slug');
			expect(result?.params).toEqual({ slug: 'featured' });
		});
	});

	describe('handleMatch', () => {
		test('should accept integration metadata from view.config.integration', async () => {
			const view = (() => '<div>Test</div>') as EcoPageComponent<any>;
			view.config = {
				integration: 'string',
				identity: { id: 'test', file: '/test/-view.ts', integration: 'string' },
			};

			const mockResponse = new Response('<html>Test</html>');
			const renderExplicitView = vi.fn(() => mockResponse);
			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: {
					getExplicitViewRenderer: vi.fn(() => ({
						renderExplicitView,
					})),
				} as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');
			const response = await matcher.handleMatch(match!);

			expect(response).toBe(mockResponse);
			expect(renderExplicitView).toHaveBeenCalledWith(view, {}, { params: {} });
		});

		test('should throw error when view is missing __eco.integration', async () => {
			const viewWithoutIntegration = (() => '<div>Test</div>') as EcoPageComponent<any>;
			viewWithoutIntegration.config = {
				identity: undefined,
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: {
					getExplicitViewRenderer: vi.fn(() => null),
				} as any,
				staticRoutes: [createMockRoute('/about', viewWithoutIntegration)],
			});
			const match = matcher.match('http://localhost:3000/about');

			expect(match).not.toBeNull();
			await expect(matcher.handleMatch(match!)).rejects.toThrow('missing component identity integration');
		});

		test('should throw error when renderer is not found', async () => {
			const view = createMockView('nonexistent-integration');
			const RendererFactory = {
				getExplicitViewRenderer: vi.fn(() => null),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: RendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');

			await expect(matcher.handleMatch(match!)).rejects.toThrow(
				'No renderer found for integration: nonexistent-integration',
			);
		});

		test('should rethrow without logging when rendering throws HttpError.Forbidden', async () => {
			const view = createMockView('string');
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: {
					getExplicitViewRenderer: vi.fn(() => ({
						renderExplicitView: vi.fn(() => {
							throw HttpError.Forbidden('Admin only');
						}),
					})),
				} as any,
				staticRoutes: [createMockRoute('/admin', view)],
			});

			const match = matcher.match('http://localhost:3000/admin');

			try {
				await expect(matcher.handleMatch(match!)).rejects.toMatchObject({ status: 403 });
				expect(errorSpy).not.toHaveBeenCalled();
			} finally {
				errorSpy.mockRestore();
			}
		});

		test('should rethrow when rendering the view fails', async () => {
			const view = createMockView('string');
			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: {
					getExplicitViewRenderer: vi.fn(() => ({
						renderExplicitView: vi.fn(() => {
							throw new Error('Intentional server error');
						}),
					})),
				} as any,
				staticRoutes: [createMockRoute('/boom', view)],
			});

			const match = matcher.match('http://localhost:3000/boom');

			await expect(matcher.handleMatch(match!)).rejects.toThrow('Intentional server error');
		});

		test('should call renderer.renderExplicitView with correct arguments', async () => {
			const view = createMockView('string');
			const mockResponse = new Response('<html>Test</html>');
			const RenderToResponse = vi.fn(() => mockResponse);
			const RendererFactory = {
				getExplicitViewRenderer: vi.fn(() => ({
					renderExplicitView: RenderToResponse,
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: RendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');
			const response = await matcher.handleMatch(match!);

			expect(response).toBe(mockResponse);
			expect(RenderToResponse).toHaveBeenCalledTimes(1);
			expect(RenderToResponse).toHaveBeenCalledWith(view, {}, { params: {} });
		});

		test('should resolve staticProps and pass to renderer', async () => {
			const view = createMockView('string');
			view.staticProps = vi.fn(async () => ({
				props: { title: 'About Page', content: 'Hello' },
			}));

			const mockResponse = new Response('<html>Test</html>');
			const RenderToResponse = vi.fn(() => mockResponse);
			const RendererFactory = {
				getExplicitViewRenderer: vi.fn(() => ({
					renderExplicitView: RenderToResponse,
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: RendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');
			await matcher.handleMatch(match!);

			expect(view.staticProps).toHaveBeenCalledTimes(1);
			expect(RenderToResponse).toHaveBeenCalledWith(
				view,
				{ title: 'About Page', content: 'Hello' },
				{
					params: {},
				},
			);
		});

		test('should pass params to staticProps', async () => {
			const view = createMockView('string');
			view.staticProps = vi.fn(async ({ pathname }) => ({
				props: { slug: pathname.params.slug },
			}));

			const mockResponse = new Response('<html>Test</html>');
			const RendererFactory = {
				getExplicitViewRenderer: vi.fn(() => ({
					renderExplicitView: vi.fn(() => mockResponse),
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: RendererFactory as any,
				staticRoutes: [createMockRoute('/blog/:slug', view)],
			});

			const match = matcher.match('http://localhost:3000/blog/hello-world');
			await matcher.handleMatch(match!);

			expect(view.staticProps).toHaveBeenCalledWith(
				expect.objectContaining({
					pathname: { params: { slug: 'hello-world' } },
				}),
			);
		});
	});
});
