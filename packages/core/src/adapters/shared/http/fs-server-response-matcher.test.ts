import { describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import { APP_TEST_ROUTES, FIXTURE_APP_PROJECT_DIR, INDEX_TEMPLATE_FILE } from '../../../../__fixtures__/constants.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import type { MatchResult } from '../../../types/internal-types.ts';
import { RouteRendererFactory } from '../../../route-renderer/route-renderer.ts';
import type { PageRendererResolver } from '../../../route-renderer/route-renderer.ts';
import { RouteRegistry } from '../../../router/server/route-registry.ts';
import { MemoryCacheStore } from '../../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../../services/cache/page-cache-service.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

for (const integration of appConfig.integrations) {
	integration.setConfig(appConfig);
	integration.setRuntimeOrigin(appConfig.baseUrl);
}

const router = new RouteRegistry({
	pagesDir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
	appConfig,
	origin: appConfig.baseUrl,
	templatesExt: appConfig.templatesExt,
	buildMode: false,
	pageModuleAdapter: {
		loadPageModule: vi.fn(async () => ({})),
	},
});

await router.init();

const routeRendererFactory = new RouteRendererFactory({
	appConfig,
	runtimeOrigin: appConfig.baseUrl,
});

function createRouteRendererFactoryWithStub404(
	realFactory: PageRendererResolver,
	error404TemplatePath: string,
	options?: { executeError?: Error },
): { factory: PageRendererResolver; execute: ReturnType<typeof vi.fn> } {
	const execute = options?.executeError
		? vi.fn(async () => {
				throw options.executeError;
			})
		: vi.fn(async () => ({
				body: '<h1>404 - Page Not Found</h1>',
			}));

	const stub404Renderer = {
		execute,
		loadPageModule: vi.fn(async () => ({
			default: () => null,
		})),
	};

	return {
		execute,
		factory: {
			getPageRenderer(filePath: string) {
				if (filePath === error404TemplatePath) {
					return stub404Renderer;
				}

				return realFactory.getPageRenderer(filePath);
			},
		},
	};
}

function createRouteRendererFactoryWithStub500(
	realFactory: PageRendererResolver,
	error500TemplatePath: string,
	options?: { executeError?: Error },
): { factory: PageRendererResolver; execute: ReturnType<typeof vi.fn> } {
	const execute = options?.executeError
		? vi.fn(async () => {
				throw options.executeError;
			})
		: vi.fn(async () => ({
				body: '<h1>500 - Internal Server Error</h1>',
			}));

	const stub500Renderer = {
		execute,
		loadPageModule: vi.fn(async () => ({
			default: () => null,
		})),
	};

	return {
		execute,
		factory: {
			getPageRenderer(filePath: string) {
				if (filePath === error500TemplatePath) {
					return stub500Renderer;
				}

				return realFactory.getPageRenderer(filePath);
			},
		},
	};
}

function createRouteRendererFactoryWithThrowingPage(
	realFactory: PageRendererResolver,
	pageFilePath: string,
	error: Error,
): PageRendererResolver {
	return {
		getPageRenderer(filePath: string) {
			if (filePath === pageFilePath) {
				return {
					execute: vi.fn(async () => {
						throw error;
					}),
					loadPageModule: vi.fn(async () => ({
						default: () => null,
					})),
				};
			}

			return realFactory.getPageRenderer(filePath);
		},
	};
}

function createRouteRendererFactoryWithMissing404Template(error404TemplatePath: string): PageRendererResolver {
	return {
		getPageRenderer(filePath: string) {
			if (filePath === error404TemplatePath) {
				throw new Error('404 template not found');
			}

			throw new Error(`Unexpected page renderer request: ${filePath}`);
		},
	};
}

function createRouteRendererFactoryWithMissing500Template(
	realFactory: PageRendererResolver,
	error500TemplatePath: string,
): PageRendererResolver {
	return {
		getPageRenderer(filePath: string) {
			if (filePath === error500TemplatePath) {
				throw new Error('500 template not found');
			}

			return realFactory.getPageRenderer(filePath);
		},
	};
}

const { factory: routeRendererFactoryForNoMatchTests } = createRouteRendererFactoryWithStub404(
	routeRendererFactory,
	appConfig.absolutePaths.error404TemplatePath,
);

const fileSystemResponseFactory = new FileSystemServerResponseFactory({
	options: {
		watchMode: false,
	},
});

describe('FileSystemResponseMatcher', () => {
	describe('without cache service', () => {
		const matcherWithoutCache = new FileSystemResponseMatcher({
			appConfig,
			assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
			router,
			routeRendererFactory: routeRendererFactoryForNoMatchTests,
			fileSystemResponseFactory,
		});

		it('should return custom 404 page for unmatched request URL', async () => {
			const requestUrl = APP_TEST_ROUTES.nonExistentFile;
			const response = await matcherWithoutCache.handleNoMatch(requestUrl);
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should handle match with disabled cache headers', async () => {
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};
			const response = await matcherWithoutCache.handleMatch(match);
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(response.headers.get('X-Cache')).toBe('DISABLED');
			expect(response.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
		});

		it('should return null for getCacheService when not configured', () => {
			expect(matcherWithoutCache.getCacheService()).toBeNull();
		});
	});

	describe('with cache service', () => {
		const cacheService = new PageCacheService({
			store: new MemoryCacheStore(),
			enabled: true,
		});

		const matcherWithCache = new FileSystemResponseMatcher({
			appConfig,
			assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: 'static',
		});

		it('should return cache service via getCacheService', () => {
			expect(matcherWithCache.getCacheService()).toBe(cacheService);
		});

		it('should return X-Cache header on first request (MISS)', async () => {
			const match: MatchResult = {
				requestedPathname: '/cache-test-miss',
				templateRoute: {
					kind: 'exact',
					pathname: '/cache-test-miss',
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};
			const response = await matcherWithCache.handleMatch(match);
			expect(response.headers.get('X-Cache')).toBe('MISS');
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should return X-Cache HIT on second request to same path', async () => {
			const uniquePath = `/cache-test-hit-${Date.now()}`;
			const match: MatchResult = {
				requestedPathname: uniquePath,
				templateRoute: {
					kind: 'exact',
					pathname: uniquePath,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response1 = await matcherWithCache.handleMatch(match);
			const response2 = await matcherWithCache.handleMatch(match);

			expect(response1.headers.get('X-Cache')).toBe('MISS');
			expect(response2.headers.get('X-Cache')).toBe('HIT');
		});

		it('should cache different paths separately', async () => {
			const match1: MatchResult = {
				requestedPathname: '/path-a',
				templateRoute: {
					kind: 'exact',
					pathname: '/path-a',
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};
			const match2: MatchResult = {
				requestedPathname: '/path-b',
				templateRoute: {
					kind: 'exact',
					pathname: '/path-b',
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response1 = await matcherWithCache.handleMatch(match1);
			const response2 = await matcherWithCache.handleMatch(match2);

			expect(response1.headers.get('X-Cache')).toBe('MISS');
			expect(response2.headers.get('X-Cache')).toBe('MISS');
		});

		it('should include query params in cache key', async () => {
			const basePath = `/search-${Date.now()}`;
			const matchWithQuery: MatchResult = {
				requestedPathname: basePath,
				templateRoute: {
					kind: 'exact',
					pathname: basePath,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: { q: 'test' },
			};
			const matchWithDifferentQuery: MatchResult = {
				requestedPathname: basePath,
				templateRoute: {
					kind: 'exact',
					pathname: basePath,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: { q: 'other' },
			};

			const firstCall = await matcherWithCache.handleMatch(matchWithQuery);
			const response1 = await matcherWithCache.handleMatch(matchWithQuery);
			const response2 = await matcherWithCache.handleMatch(matchWithDifferentQuery);

			expect(firstCall.headers.get('X-Cache')).toBe('MISS');
			expect(response1.headers.get('X-Cache')).toBe('HIT');
			expect(response2.headers.get('X-Cache')).toBe('MISS');
		});
	});

	describe('with dynamic cache strategy', () => {
		const cacheService = new PageCacheService({
			store: new MemoryCacheStore(),
			enabled: true,
		});

		const dynamicMatcher = new FileSystemResponseMatcher({
			appConfig,
			assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: 'dynamic',
		});

		it('should bypass cache entirely for dynamic strategy', async () => {
			const match: MatchResult = {
				requestedPathname: '/dynamic-page',
				templateRoute: {
					kind: 'exact',
					pathname: '/dynamic-page',
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response1 = await dynamicMatcher.handleMatch(match);
			const response2 = await dynamicMatcher.handleMatch(match);

			expect(response1.headers.get('X-Cache')).toBe('DISABLED');
			expect(response2.headers.get('X-Cache')).toBe('DISABLED');
			expect(response1.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
		});
	});

	describe('handleNoMatch content type behavior', () => {
		const matcher = new FileSystemResponseMatcher({
			appConfig,
			assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
			router,
			routeRendererFactory: routeRendererFactoryForNoMatchTests,
			fileSystemResponseFactory,
		});

		it('should return custom 404 page for known extension like .html', async () => {
			const response = await matcher.handleNoMatch('/non-existent-page.html');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for page requests without extension', async () => {
			const response = await matcher.handleNoMatch('/non-existent-page');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for unknown extensions', async () => {
			const response = await matcher.handleNoMatch('/page.xyz');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for trailing dot', async () => {
			const response = await matcher.handleNoMatch('/page.');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should serve text/plain files from disk', async () => {
			const readFileAsBuffer = vi.spyOn(fileSystem, 'readFileAsBuffer').mockReturnValue(Buffer.from('robots'));
			const response = await matcher.handleNoMatch('/robots.txt');
			readFileAsBuffer.mockRestore();
			expect(response.headers.get('Content-Type')).toBe('text/plain');
		});

		it('should return custom 404 page for non-existent static files', async () => {
			const response = await matcher.handleNoMatch('/non-existent.txt');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});
	});

	describe('error taxonomy', () => {
		it('should return custom HTML 404 when a matched route throws HttpError.NotFound', async () => {
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				HttpError.NotFound('Unknown content entry'),
			);
			const { factory: factoryWithStub404, execute: execute404 } = createRouteRendererFactoryWithStub404(
				throwingFactory,
				appConfig.absolutePaths.error404TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub404,
				fileSystemResponseFactory,
			});
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response = await matcher.handleMatch(match);

			expect(response.status).toBe(404);
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(await response.text()).toContain('<h1>404 - Page Not Found</h1>');
			expect(execute404).toHaveBeenCalledWith({
				file: appConfig.absolutePaths.error404TemplatePath,
				props: undefined,
				locals: {},
			});
		});

		it('should return custom HTML 500 when a matched route render throws', async () => {
			const renderError = new Error('page render failed');
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				renderError,
			);
			const { factory: factoryWithStub500 } = createRouteRendererFactoryWithStub500(
				throwingFactory,
				appConfig.absolutePaths.error500TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub500,
				fileSystemResponseFactory,
			});
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response = await matcher.handleMatch(match);

			expect(response.status).toBe(500);
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
		});

		it('should pass message and stack to the custom 500 page in development', async () => {
			const previousNodeEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'development';

			try {
				const renderError = new Error('page render failed');
				const throwingFactory = createRouteRendererFactoryWithThrowingPage(
					routeRendererFactory,
					INDEX_TEMPLATE_FILE,
					renderError,
				);
				const { factory: factoryWithStub500, execute } = createRouteRendererFactoryWithStub500(
					throwingFactory,
					appConfig.absolutePaths.error500TemplatePath,
				);
				const matcher = new FileSystemResponseMatcher({
					appConfig,
					assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
					router,
					routeRendererFactory: factoryWithStub500,
					fileSystemResponseFactory,
				});
				const match: MatchResult = {
					requestedPathname: APP_TEST_ROUTES.index,
					templateRoute: {
						kind: 'exact',
						pathname: APP_TEST_ROUTES.index,
						filePath: INDEX_TEMPLATE_FILE,
					},
					params: {},
					query: {},
				};

				await matcher.handleMatch(match);

				expect(execute).toHaveBeenCalledWith({
					file: appConfig.absolutePaths.error500TemplatePath,
					props: {
						message: 'page render failed',
						stack: renderError.stack,
					},
					locals: {},
				});
			} finally {
				process.env.NODE_ENV = previousNodeEnv;
			}
		});

		it('should omit error details from the custom 500 page in production', async () => {
			const previousNodeEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';

			try {
				const renderError = new Error('page render failed');
				const throwingFactory = createRouteRendererFactoryWithThrowingPage(
					routeRendererFactory,
					INDEX_TEMPLATE_FILE,
					renderError,
				);
				const { factory: factoryWithStub500, execute } = createRouteRendererFactoryWithStub500(
					throwingFactory,
					appConfig.absolutePaths.error500TemplatePath,
				);
				const matcher = new FileSystemResponseMatcher({
					appConfig,
					assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
					router,
					routeRendererFactory: factoryWithStub500,
					fileSystemResponseFactory,
				});
				const match: MatchResult = {
					requestedPathname: APP_TEST_ROUTES.index,
					templateRoute: {
						kind: 'exact',
						pathname: APP_TEST_ROUTES.index,
						filePath: INDEX_TEMPLATE_FILE,
					},
					params: {},
					query: {},
				};

				await matcher.handleMatch(match);

				expect(execute).toHaveBeenCalledWith({
					file: appConfig.absolutePaths.error500TemplatePath,
					props: undefined,
					locals: {},
				});
			} finally {
				process.env.NODE_ENV = previousNodeEnv;
			}
		});

		it('should return plain 500 when a matched route throws and the custom 500 template is missing', async () => {
			const renderError = new Error('page render failed');
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				renderError,
			);
			const factoryWithout500 = createRouteRendererFactoryWithMissing500Template(
				throwingFactory,
				appConfig.absolutePaths.error500TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithout500,
				fileSystemResponseFactory,
			});
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response = await matcher.handleMatch(match);

			expect(response.status).toBe(500);
			expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
			expect(await response.text()).toBe('Internal Server Error');
		});

		it('should fall back to plain 500 when the custom 500 template render throws', async () => {
			const renderError = new Error('page render failed');
			const templateError = new Error('500 template render failed');
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				renderError,
			);
			const { factory: factoryWithThrowing500 } = createRouteRendererFactoryWithStub500(
				throwingFactory,
				appConfig.absolutePaths.error500TemplatePath,
				{ executeError: templateError },
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithThrowing500,
				fileSystemResponseFactory,
			});
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};

			const response = await matcher.handleMatch(match);

			expect(response.status).toBe(500);
			expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
			expect(await response.text()).toBe('Internal Server Error');
		});

		it('should return custom HTML 500 when the custom 404 template render throws', async () => {
			const templateError = new Error('404 template render failed');
			const { factory: throwing404Factory } = createRouteRendererFactoryWithStub404(
				routeRendererFactory,
				appConfig.absolutePaths.error404TemplatePath,
				{ executeError: templateError },
			);
			const { factory: factoryWithStub500 } = createRouteRendererFactoryWithStub500(
				throwing404Factory,
				appConfig.absolutePaths.error500TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub500,
				fileSystemResponseFactory,
			});

			const response = await matcher.handleNoMatch('/missing-page');

			expect(response.status).toBe(500);
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
		});

		it('should fall back to default 404 when the custom 404 template cannot be resolved', async () => {
			const missing404Factory = createRouteRendererFactoryWithMissing404Template(
				appConfig.absolutePaths.error404TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: missing404Factory,
				fileSystemResponseFactory,
			});

			const response = await matcher.handleNoMatch('/missing-page');

			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain('<h1>404 - Page Not Found</h1>');
		});
	});

	describe('internal transpile output', () => {
		it('should inspect page modules through the owning route renderer', async () => {
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory,
				fileSystemResponseFactory,
			});

			const loadPageModule = vi.fn(async () => ({}));
			(matcher as any).routeRendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule,
				})),
			};

			await (matcher as any).importPageModule(INDEX_TEMPLATE_FILE);

			expect((matcher as any).routeRendererFactory.getPageRenderer).toHaveBeenCalledWith(INDEX_TEMPLATE_FILE);
			expect(loadPageModule).toHaveBeenCalledWith(INDEX_TEMPLATE_FILE);
		});

		it('reuses the inspected page module during render without a second load', async () => {
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory,
				fileSystemResponseFactory,
			});

			const pageModule = { default: { cache: 'static' as const, middleware: [] } };
			const loadPageModule = vi.fn(async () => pageModule);
			const execute = vi.fn(async (options: { pageModule?: unknown }) => {
				expect(options.pageModule).toBe(pageModule);
				return { body: '<html></html>', cacheStrategy: 'static' as const };
			});
			(matcher as any).routeRendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule,
					execute,
				})),
			};

			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: {
					kind: 'exact',
					pathname: APP_TEST_ROUTES.index,
					filePath: INDEX_TEMPLATE_FILE,
				},
				params: {},
				query: {},
			};
			await matcher.handleMatch(match);

			expect(loadPageModule).toHaveBeenCalledTimes(1);
			expect(execute).toHaveBeenCalledTimes(1);
		});
	});
});
