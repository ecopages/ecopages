import { describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import { APP_TEST_ROUTES, INDEX_TEMPLATE_FILE } from '../../../../__fixtures__/constants.ts';
import { createFixtureAppConfig } from '../../../../__fixtures__/app/test-app-config.ts';
import type { HttpErrorPageStatus } from '../../../errors/http-error-page-contract.ts';
import type { EcoPagesAppConfig, MatchResult } from '../../../types/internal-types.ts';
import { RouteRendererFactory, type StaticGenerationRendererResolver } from '../../../route-renderer/route-renderer.ts';
import { RouteRegistry } from '../../../router/server/route-registry.ts';
import { MemoryCacheStore } from '../../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../../services/cache/page-cache-service.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';

const appConfig = await createFixtureAppConfig();

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
	realFactory: StaticGenerationRendererResolver,
	error404TemplatePath: string,
	options?: { executeError?: Error },
): { factory: StaticGenerationRendererResolver; execute: ReturnType<typeof vi.fn> } {
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
			getExplicitViewRenderer: realFactory.getExplicitViewRenderer?.bind(realFactory),
		},
	};
}

function createRouteRendererFactoryWithStub500(
	realFactory: StaticGenerationRendererResolver,
	error500TemplatePath: string,
	options?: { executeError?: Error },
): { factory: StaticGenerationRendererResolver; execute: ReturnType<typeof vi.fn> } {
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
			getExplicitViewRenderer: realFactory.getExplicitViewRenderer?.bind(realFactory),
		},
	};
}

function createRouteRendererFactoryWithThrowingPage(
	realFactory: StaticGenerationRendererResolver,
	pageFilePath: string,
	error: Error,
): StaticGenerationRendererResolver {
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
		getExplicitViewRenderer: realFactory.getExplicitViewRenderer?.bind(realFactory),
	};
}

function createRouteRendererFactoryWithMissing404Template(
	error404TemplatePath: string,
): StaticGenerationRendererResolver {
	return {
		getPageRenderer(filePath: string) {
			if (filePath === error404TemplatePath) {
				throw new Error('404 template not found');
			}

			throw new Error(`Unexpected page renderer request: ${filePath}`);
		},
		getExplicitViewRenderer: () => null,
	};
}

function createRouteRendererFactoryWithMissing500Template(
	realFactory: StaticGenerationRendererResolver,
	error500TemplatePath: string,
): StaticGenerationRendererResolver {
	return {
		getPageRenderer(filePath: string) {
			if (filePath === error500TemplatePath) {
				throw new Error('500 template not found');
			}

			return realFactory.getPageRenderer(filePath);
		},
		getExplicitViewRenderer: realFactory.getExplicitViewRenderer.bind(realFactory),
	};
}

function withErrorPageTemplatePaths(
	config: EcoPagesAppConfig,
	overrides: Partial<Record<HttpErrorPageStatus, string>>,
): EcoPagesAppConfig {
	const current = config.absolutePaths.errorPageTemplatePaths;
	const pathFor = (status: HttpErrorPageStatus): string => overrides[status] ?? current?.[status] ?? '';
	const errorPageTemplatePaths: Record<HttpErrorPageStatus, string> = {
		400: pathFor(400),
		401: pathFor(401),
		403: pathFor(403),
		404: pathFor(404),
		409: pathFor(409),
		500: pathFor(500),
	};

	return {
		...config,
		absolutePaths: {
			...config.absolutePaths,
			errorPageTemplatePaths,
			error404TemplatePath: errorPageTemplatePaths[404],
			error500TemplatePath: errorPageTemplatePaths[500],
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
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('<h1>404 - Page Not Found</h1>');
			expect(execute404).toHaveBeenCalledWith({
				file: appConfig.absolutePaths.error404TemplatePath,
				props: {
					status: 404,
					message: 'Unknown content entry',
				},
				locals: {},
			});
		});

		it('should not log a server error when a matched route throws HttpError.NotFound', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				HttpError.NotFound('Unknown content entry'),
			);
			const { factory: factoryWithStub404 } = createRouteRendererFactoryWithStub404(
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

			try {
				const response = await matcher.handleMatch(match);
				expect(response.status).toBe(404);
				expect(errorSpy).not.toHaveBeenCalled();
			} finally {
				errorSpy.mockRestore();
			}
		});

		it('should render HTML 404 from renderServerError when the failure is HttpError.NotFound', async () => {
			const { factory: factoryWithStub404, execute: execute404 } = createRouteRendererFactoryWithStub404(
				routeRendererFactory,
				appConfig.absolutePaths.error404TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub404,
				fileSystemResponseFactory,
			});

			const response = await matcher.renderServerError('/posts/missing', HttpError.NotFound('Post not found'));

			expect(response.status).toBe(404);
			expect(await response.text()).toContain('<h1>404 - Page Not Found</h1>');
			expect(execute404).toHaveBeenCalled();
		});

		it('should preserve HttpError 502 on the server-error page', async () => {
			const { factory: factoryWithStub500, execute } = createRouteRendererFactoryWithStub500(
				routeRendererFactory,
				appConfig.absolutePaths.error500TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub500,
				fileSystemResponseFactory,
			});

			const response = await matcher.renderServerError('/upstream', new HttpError(502, 'Bad Gateway'));

			expect(response.status).toBe(502);
			expect(response.statusText).toBe('502');
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
			expect(execute).toHaveBeenCalledWith({
				file: appConfig.absolutePaths.error500TemplatePath,
				props: {
					status: 502,
				},
				locals: {},
			});
		});

		it('should preserve HttpError 502 when the server-error page falls back to the built-in document', async () => {
			const { factory: factoryWithThrowing500 } = createRouteRendererFactoryWithStub500(
				routeRendererFactory,
				appConfig.absolutePaths.error500TemplatePath,
				{ executeError: new Error('500 template render failed') },
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithThrowing500,
				fileSystemResponseFactory,
			});

			const response = await matcher.renderServerError('/upstream', new HttpError(502, 'Bad Gateway'));
			const body = await response.text();

			expect(response.status).toBe(502);
			expect(body).toContain('ERROR 502');
			expect(body).toContain('eco-error-page__title">Something went wrong</h1>');
			expect(body).toContain('eco-error-page--server-error');
		});

		it.each([200, 700])('should normalize invalid HttpError status %s to HTML 500', async (status) => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory,
				fileSystemResponseFactory,
			});

			try {
				const response = await matcher.renderServerError(
					'/invalid-status',
					new HttpError(status, 'Invalid status'),
				);

				expect(response.status).toBe(500);
				expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
			} finally {
				errorSpy.mockRestore();
			}
		});

		it('should render HTML 500 from renderServerError when the failure is a generic Error', async () => {
			const { factory: factoryWithStub500 } = createRouteRendererFactoryWithStub500(
				routeRendererFactory,
				appConfig.absolutePaths.error500TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: factoryWithStub500,
				fileSystemResponseFactory,
			});

			const response = await matcher.renderServerError('/boom', new Error('Intentional server error'));

			expect(response.status).toBe(500);
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
		});

		it.each([
			['BadRequest', HttpError.BadRequest('Bad payload'), 400, 'Bad Request'],
			['Unauthorized', HttpError.Unauthorized('Login required'), 401, 'Unauthorized'],
			['Forbidden', HttpError.Forbidden('Admin only'), 403, 'Forbidden'],
			['Conflict', HttpError.Conflict('Already exists'), 409, 'Conflict'],
		] as const)('should preserve HttpError.%s as HTML %s', async (_name, error, status, title) => {
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory,
				fileSystemResponseFactory,
			});

			const response = await matcher.renderServerError('/protected', error);

			expect(response.status).toBe(status);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain(`eco-error-page__title">${title}</h1>`);
		});

		it('should not log a server error when a matched route throws HttpError.Forbidden', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const throwingFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				HttpError.Forbidden('Admin only'),
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: throwingFactory,
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

			try {
				const response = await matcher.handleMatch(match);
				expect(response.status).toBe(403);
				expect(errorSpy).not.toHaveBeenCalled();
			} finally {
				errorSpy.mockRestore();
			}
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
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
		});

		it('should log a server error when a matched route render throws', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
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

			try {
				const response = await matcher.handleMatch(match);
				expect(response.status).toBe(500);
				expect(errorSpy).toHaveBeenCalled();
			} finally {
				errorSpy.mockRestore();
			}
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
						status: 500,
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
					props: {
						status: 500,
					},
					locals: {},
				});
			} finally {
				process.env.NODE_ENV = previousNodeEnv;
			}
		});

		it('should return the built-in HTML 500 when a matched route throws and the custom 500 template is missing', async () => {
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
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('eco-error-page__title">Something went wrong</h1>');
		});

		it('should fall back to the built-in HTML 500 when the custom 500 template render throws', async () => {
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
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('eco-error-page__title">Something went wrong</h1>');
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
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(await response.text()).toContain('<h1>500 - Internal Server Error</h1>');
		});

		it('should render registered error views when filesystem pages are absent', async () => {
			const appConfigWithoutErrorPages = withErrorPageTemplatePaths(appConfig, {
				404: path.join(appConfig.rootDir, 'missing-404.ts'),
				500: path.join(appConfig.rootDir, 'missing-500.ts'),
			});
			const renderToResponse = vi.fn(
				async (_view, props, context) =>
					new Response(`<h1>${context.status} ${props.message ?? 'registered'}</h1>`),
			);
			const view = Object.assign(() => null, {
				config: { identity: { integration: 'fixture', file: '/src/views/error.tsx' } },
			});
			const routeRendererFactory = {
				getPageRenderer: vi.fn(),
				getExplicitViewRenderer: vi.fn(() => ({ renderToResponse })),
			};
			const matcher = new FileSystemResponseMatcher({
				appConfig: appConfigWithoutErrorPages,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory,
				errorPageLoaders: {
					notFound: async () => ({ default: view as never }),
					serverError: async () => ({ default: view as never }),
				},
				fileSystemResponseFactory,
			});

			const notFoundResponse = await matcher.handleNoMatch('/missing-page');
			expect(notFoundResponse.status).toBe(404);
			expect(await notFoundResponse.text()).toContain('404 registered');

			const throwingPageFactory = createRouteRendererFactoryWithThrowingPage(
				routeRendererFactory,
				INDEX_TEMPLATE_FILE,
				new Error('page failed'),
			);
			const failingMatcher = new FileSystemResponseMatcher({
				appConfig: appConfigWithoutErrorPages,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: throwingPageFactory,
				errorPageLoaders: {
					notFound: async () => {
						throw new Error('not-found view failed');
					},
					serverError: async () => ({ default: view as never }),
				},
				fileSystemResponseFactory,
			});
			const match: MatchResult = {
				requestedPathname: APP_TEST_ROUTES.index,
				templateRoute: { kind: 'exact', pathname: APP_TEST_ROUTES.index, filePath: INDEX_TEMPLATE_FILE },
				params: {},
				query: {},
			};

			const serverErrorResponse = await failingMatcher.handleMatch(match);
			expect(serverErrorResponse.status).toBe(500);
			expect(await serverErrorResponse.text()).toContain('500 registered');
		});

		it('should fall back to default 404 when the custom 404 template cannot be resolved', async () => {
			const appConfigWithout404Template = withErrorPageTemplatePaths(appConfig, {
				404: path.join(appConfig.rootDir, 'missing-404.ts'),
			});
			const missing404Factory = createRouteRendererFactoryWithMissing404Template(
				appConfigWithout404Template.absolutePaths.error404TemplatePath,
			);
			const matcher = new FileSystemResponseMatcher({
				appConfig: appConfigWithout404Template,
				assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
				router,
				routeRendererFactory: missing404Factory,
				fileSystemResponseFactory,
			});

			const response = await matcher.handleNoMatch('/missing-page');

			expect(response.status).toBe(404);
			expect(await response.text()).toContain('eco-error-page__title">Not Found</h1>');
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
