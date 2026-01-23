import { describe, expect, mock, test } from 'bun:test';
import type { EcoPageComponent, StaticRoute } from '../../public-types.ts';
import { ExplicitStaticRouteMatcher } from './explicit-static-route-matcher.ts';

function createMockView(integration = 'ghtml'): EcoPageComponent<any> {
	const view = (() => '<div>Test</div>') as EcoPageComponent<any>;
	view.config = {
		__eco: { integration, dir: '/test' },
	};
	return view;
}

function createMockRoute(path: string, view?: EcoPageComponent<any>): StaticRoute {
	return {
		path,
		view: view ?? createMockView(),
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
		test('should match exact static path', () => {
			const matcher = createMatcher([createMockRoute('/about')]);

			const result = matcher.match('http://localhost:3000/about');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/about');
			expect(result?.params).toEqual({});
		});

		test('should match root path', () => {
			const matcher = createMatcher([createMockRoute('/')]);

			const result = matcher.match('http://localhost:3000/');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/');
			expect(result?.params).toEqual({});
		});

		test('should match nested static path', () => {
			const matcher = createMatcher([createMockRoute('/docs/getting-started')]);

			const result = matcher.match('http://localhost:3000/docs/getting-started');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/docs/getting-started');
		});

		test('should return null for non-matching path', () => {
			const matcher = createMatcher([createMockRoute('/about')]);

			const result = matcher.match('http://localhost:3000/contact');

			expect(result).toBeNull();
		});

		test('should return null for partial match', () => {
			const matcher = createMatcher([createMockRoute('/about')]);

			const result = matcher.match('http://localhost:3000/about/team');

			expect(result).toBeNull();
		});
	});

	describe('match with :param syntax', () => {
		test('should match dynamic segment with colon syntax', () => {
			const matcher = createMatcher([createMockRoute('/blog/:slug')]);

			const result = matcher.match('http://localhost:3000/blog/hello-world');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ slug: 'hello-world' });
		});

		test('should match multiple dynamic segments', () => {
			const matcher = createMatcher([createMockRoute('/blog/:year/:month/:slug')]);

			const result = matcher.match('http://localhost:3000/blog/2024/01/hello-world');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({
				year: '2024',
				month: '01',
				slug: 'hello-world',
			});
		});

		test('should match mixed static and dynamic segments', () => {
			const matcher = createMatcher([createMockRoute('/users/:id/posts')]);

			const result = matcher.match('http://localhost:3000/users/123/posts');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ id: '123' });
		});
	});

	describe('match with [param] syntax', () => {
		test('should match dynamic segment with bracket syntax', () => {
			const matcher = createMatcher([createMockRoute('/blog/[slug]')]);

			const result = matcher.match('http://localhost:3000/blog/hello-world');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ slug: 'hello-world' });
		});

		test('should match multiple bracket parameters', () => {
			const matcher = createMatcher([createMockRoute('/products/[category]/[id]')]);

			const result = matcher.match('http://localhost:3000/products/electronics/12345');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({
				category: 'electronics',
				id: '12345',
			});
		});
	});

	describe('match with catch-all routes', () => {
		test('should match catch-all with bracket syntax', () => {
			const matcher = createMatcher([createMockRoute('/docs/[...path]')]);

			const result = matcher.match('http://localhost:3000/docs/api/reference/components');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ path: 'api/reference/components' });
		});

		test('should match catch-all with colon syntax', () => {
			const matcher = createMatcher([createMockRoute('/files/:...path')]);

			const result = matcher.match('http://localhost:3000/files/images/2024/photo.jpg');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ path: 'images/2024/photo.jpg' });
		});

		test('should match catch-all with single segment', () => {
			const matcher = createMatcher([createMockRoute('/docs/[...path]')]);

			const result = matcher.match('http://localhost:3000/docs/intro');

			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ path: 'intro' });
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
			expect(result?.route.view).toBe(aboutView);
		});

		test('should match exact route before dynamic route', () => {
			const exactView = createMockView();
			const dynamicView = createMockView();

			const matcher = createMatcher([
				createMockRoute('/blog/featured', exactView),
				createMockRoute('/blog/:slug', dynamicView),
			]);

			const result = matcher.match('http://localhost:3000/blog/featured');

			expect(result).not.toBeNull();
			expect(result?.route.view).toBe(exactView);
		});
	});

	describe('edge cases', () => {
		test('should handle URL with query parameters', () => {
			const matcher = createMatcher([createMockRoute('/search')]);

			const result = matcher.match('http://localhost:3000/search?q=test&page=1');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/search');
		});

		test('should handle URL with hash', () => {
			const matcher = createMatcher([createMockRoute('/docs/intro')]);

			const result = matcher.match('http://localhost:3000/docs/intro#section-1');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/docs/intro');
		});

		test('should handle trailing slash', () => {
			const matcher = createMatcher([createMockRoute('/about')]);

			const result = matcher.match('http://localhost:3000/about/');

			expect(result).not.toBeNull();
			expect(result?.route.path).toBe('/about');
		});

		test('should return null for empty routes array', () => {
			const matcher = createMatcher([]);

			const result = matcher.match('http://localhost:3000/anything');

			expect(result).toBeNull();
		});
	});

	describe('handleMatch', () => {
		test('should throw error when view is missing __eco.integration', async () => {
			const viewWithoutIntegration = (() => '<div>Test</div>') as EcoPageComponent<any>;
			viewWithoutIntegration.config = {
				__eco: undefined,
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: {
					getRendererByIntegration: mock(() => null),
				} as any,
				staticRoutes: [createMockRoute('/about', viewWithoutIntegration)],
			});
			const match = matcher.match('http://localhost:3000/about');

			expect(match).not.toBeNull();
			await expect(matcher.handleMatch(match!)).rejects.toThrow('missing __eco.integration');
		});

		test('should throw error when renderer is not found', async () => {
			const view = createMockView('nonexistent-integration');
			const mockRendererFactory = {
				getRendererByIntegration: mock(() => null),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: mockRendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');

			await expect(matcher.handleMatch(match!)).rejects.toThrow(
				'No renderer found for integration: nonexistent-integration',
			);
		});

		test('should call renderer.renderToResponse with correct arguments', async () => {
			const view = createMockView('ghtml');
			const mockResponse = new Response('<html>Test</html>');
			const mockRenderToResponse = mock(() => mockResponse);
			const mockRendererFactory = {
				getRendererByIntegration: mock(() => ({
					renderToResponse: mockRenderToResponse,
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: mockRendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');
			const response = await matcher.handleMatch(match!);

			expect(response).toBe(mockResponse);
			expect(mockRenderToResponse).toHaveBeenCalledTimes(1);
			expect(mockRenderToResponse).toHaveBeenCalledWith(view, {}, {});
		});

		test('should resolve staticProps and pass to renderer', async () => {
			const view = createMockView('ghtml');
			view.staticProps = mock(async () => ({
				props: { title: 'About Page', content: 'Hello' },
			}));

			const mockResponse = new Response('<html>Test</html>');
			const mockRenderToResponse = mock(() => mockResponse);
			const mockRendererFactory = {
				getRendererByIntegration: mock(() => ({
					renderToResponse: mockRenderToResponse,
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: mockRendererFactory as any,
				staticRoutes: [createMockRoute('/about', view)],
			});

			const match = matcher.match('http://localhost:3000/about');
			await matcher.handleMatch(match!);

			expect(view.staticProps).toHaveBeenCalledTimes(1);
			expect(mockRenderToResponse).toHaveBeenCalledWith(view, { title: 'About Page', content: 'Hello' }, {});
		});

		test('should pass params to staticProps', async () => {
			const view = createMockView('ghtml');
			view.staticProps = mock(async ({ pathname }) => ({
				props: { slug: pathname.params.slug },
			}));

			const mockResponse = new Response('<html>Test</html>');
			const mockRendererFactory = {
				getRendererByIntegration: mock(() => ({
					renderToResponse: mock(() => mockResponse),
				})),
			};

			const matcher = new ExplicitStaticRouteMatcher({
				appConfig: { baseUrl: 'http://localhost:3000' } as any,
				routeRendererFactory: mockRendererFactory as any,
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
