import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { StaticSiteGenerator } from './static-site-generator';
import type { RouteModuleBuildCache } from '../services/module-loading/route-module-build-cache.store.ts';
import type { EcoPagesAppConfig } from '../types/internal-types';
import { appLogger } from '../global/app-logger.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';

const graphBuildOrder: string[] = [];
const ensurePagesUnifiedGraphBuiltMock = vi.hoisted(() =>
	vi.fn(async () => {
		graphBuildOrder.push('ensurePagesUnifiedGraphBuilt');
		return undefined;
	}),
);
const shouldBuildPagesUnifiedGraphMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../build/cache/pages-unified-graph-build.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../build/cache/pages-unified-graph-build.ts')>();
	return {
		...actual,
		ensurePagesUnifiedGraphBuilt: ensurePagesUnifiedGraphBuiltMock,
		shouldBuildPagesUnifiedGraph: shouldBuildPagesUnifiedGraphMock,
	};
});

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;

const createMockConfig = (overrides: Partial<EcoPagesAppConfig> = {}): EcoPagesAppConfig =>
	({
		rootDir: '/test/project',
		distDir: 'dist',
		workDir: DEFAULT_ECOPAGES_WORK_DIR,
		srcDir: 'src',
		defaultMetadata: {
			title: 'Test',
			description: 'Test site',
		},
		robotsTxt: {
			preferences: {
				'*': ['/admin', '/private'],
				Googlebot: ['/no-google'],
			},
		},
		sitemap: {
			enabled: false,
			fileName: 'sitemap.xml',
			extraUrls: [],
			exclude: [],
		},
		absolutePaths: {
			distDir: '/test/project/dist',
			workDir: '/test/project/.eco',
		} as EcoPagesAppConfig['absolutePaths'],
		integrations: [],
		processors: new Map(),
		...overrides,
	}) as EcoPagesAppConfig;

const testInjectedMeta = {
	id: 'test-page',
	file: '/src/pages/test.tsx',
	integration: 'test',
};

type StaticGenerationRouteSource = Parameters<StaticSiteGenerator['generateStaticPages']>[0]['router'];
type StaticPageRouteRendererFactory = NonNullable<
	Parameters<StaticSiteGenerator['generateStaticPages']>[0]['routeRendererFactory']
>;
type StaticGenerationRendererFactory = NonNullable<Parameters<StaticSiteGenerator['run']>[0]['routeRendererFactory']>;
type StaticGenerationRunnerInput = Parameters<StaticSiteGenerator['run']>[0];

function createMockRouteModuleBuildCache(overrides: Partial<RouteModuleBuildCache> = {}): RouteModuleBuildCache {
	return {
		isIncrementalStaticGenerationAvailable: vi.fn(() => false),
		ensureIncrementalStaticGenerationContext: vi.fn(),
		canReuseStaticRender: vi.fn(() => false),
		recordStaticRender: vi.fn(),
		pruneStaleRenderedOutputs: vi.fn(() => []),
		...overrides,
	} as unknown as RouteModuleBuildCache;
}

describe('StaticSiteGenerator', () => {
	let ensureDirMock: any;
	let writeMock: any;

	beforeEach(() => {
		ensureDirMock = vi.fn(() => {});
		writeMock = vi.fn(() => {});
		fileSystem.ensureDir = ensureDirMock;
		fileSystem.write = writeMock;
		vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
	});

	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		vi.restoreAllMocks();
	});

	describe('constructor', () => {
		test('should create instance with appConfig', () => {
			const config = createMockConfig();
			const ssg = new StaticSiteGenerator({ appConfig: config });
			expect(ssg.appConfig).toBe(config);
		});
	});

	describe('isRootDir', () => {
		test('should return true for root path /', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			expect(ssg.isRootDir('/')).toBe(true);
		});

		test('should return false for nested path /foo/bar', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			expect(ssg.isRootDir('/foo/bar')).toBe(false);
		});

		test('should return false for deeply nested paths', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			expect(ssg.isRootDir('/a/b/c/d')).toBe(false);
		});

		test('should return null (falsy) for paths without slashes', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			expect(ssg.isRootDir('no-slashes')).toBeFalsy();
		});
	});

	describe('getDirectories', () => {
		test('should return empty array for root-level routes', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dirs = ssg.getDirectories(['/about', '/contact']);
			expect(dirs).toEqual([]);
		});

		test('should extract directories from nested routes', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dirs = ssg.getDirectories(['/blog/post-1', '/blog/post-2', '/docs/api']);
			expect(dirs).toContain('/blog');
			expect(dirs).toContain('/docs');
		});

		test('should handle HTTP URLs and extract pathname', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dirs = ssg.getDirectories(['http://localhost:3000/blog/post']);
			expect(dirs).toContain('/blog');
		});

		test('should deduplicate directories', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dirs = ssg.getDirectories(['/blog/a', '/blog/b', '/blog/c']);
			expect(dirs.filter((d) => d === '/blog').length).toBe(1);
		});

		test('should handle deeply nested paths', () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dirs = ssg.getDirectories(['/a/b/c/page']);
			expect(dirs).toContain('/a/b/c');
		});
	});

	describe('generateRobotsTxt', () => {
		test('should generate robots.txt with preferences from config', () => {
			const config = createMockConfig();
			const ssg = new StaticSiteGenerator({ appConfig: config });

			ssg.generateRobotsTxt();

			expect(ensureDirMock).toHaveBeenCalledWith('/test/project/dist');
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/robots.txt', expect.any(String));

			const writtenContent = writeMock.mock.calls[0][1] as string;
			expect(writtenContent).toContain('user-agent: *');
			expect(writtenContent).toContain('disallow: /admin');
			expect(writtenContent).toContain('disallow: /private');
			expect(writtenContent).toContain('user-agent: Googlebot');
			expect(writtenContent).toContain('disallow: /no-google');
		});

		test('should handle empty preferences', () => {
			const config = createMockConfig({
				robotsTxt: { preferences: {} },
			});
			const ssg = new StaticSiteGenerator({ appConfig: config });

			ssg.generateRobotsTxt();

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/robots.txt', '');
		});
	});

	describe('generateStaticPages', () => {
		const createMockRouter = (routes: Record<string, { filePath: string; pathname: string }>) =>
			({
				listStaticGenerationRoutes: vi.fn(async () =>
					Object.values(routes)
						.filter((value) => !value.pathname.includes('['))
						.map((value) => ({
							requestUrl: `http://localhost:3000${value.pathname}`,
							pathname: value.pathname,
							templateRoute: {
								...value,
								kind: 'exact' as const,
								paramNames: [],
							},
							params: {},
						})),
				),
			}) satisfies StaticGenerationRouteSource;

		const createStaticPageModule = () => ({
			default: Object.assign(() => null, { cache: 'static' }),
		});

		test('should filter out dynamic routes containing [', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/static': { filePath: '/src/pages/static.ts', pathname: '/static' },
				'/dynamic/[id]': { filePath: '/src/pages/dynamic/[id].ts', pathname: '/dynamic/[id]' },
			});

			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => createStaticPageModule()),
					execute: vi.fn(async () => ({ body: '<html>Static</html>' })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(writeMock).toHaveBeenCalledTimes(1);
		});

		test('should create directories for nested routes', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/blog/post': { filePath: '/src/pages/blog/post.ts', pathname: '/blog/post' },
			});

			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => createStaticPageModule()),
					execute: vi.fn(async () => ({ body: '<html>Blog Post</html>' })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(ensureDirMock).toHaveBeenCalled();
		});

		test('should throw error when routeRendererFactory is missing for render strategy', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/page': { filePath: '/src/pages/page.ts', pathname: '/page' },
			});

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: undefined,
			});
		});

		test('should write index.html for root path', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/': { filePath: '/src/pages/index.ts', pathname: '/' },
			});

			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => createStaticPageModule()),
					execute: vi.fn(async () => ({ body: '<html>Home</html>' })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), '<html>Home</html>');
		});

		test('should handle Buffer content from renderer', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/': { filePath: '/src/pages/index.ts', pathname: '/' },
			});

			const bufferContent = Buffer.from('<html>Buffer Content</html>');
			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => createStaticPageModule()),
					execute: vi.fn(async () => ({ body: bufferContent })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), bufferContent);
		});

		test('should skip cache dynamic pages during static generation', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/dashboard': { filePath: '/src/pages/dashboard.tsx', pathname: '/dashboard' },
			});

			const execute = vi.fn(async () => ({ body: '<html>Dashboard</html>' }));
			const loadPageModule = vi.fn(async () => ({
				default: Object.assign(() => null, { cache: 'dynamic' }),
			}));
			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					execute,
					loadPageModule,
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(RendererFactory.getPageRenderer).toHaveBeenCalledWith('/src/pages/dashboard.tsx');
			expect(loadPageModule).toHaveBeenCalledWith('/src/pages/dashboard.tsx');
			expect(execute).not.toHaveBeenCalled();
			expect(writeMock).not.toHaveBeenCalled();
		});

		test('should probe render-strategy pages without a separate static-page-probe cache scope', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const filePath = '/src/pages/index.ts';
			const Router = createMockRouter({
				'/': { filePath, pathname: '/' },
			});
			const loadPageModule = vi.fn(async () => createStaticPageModule());
			const execute = vi.fn(async () => ({ body: '<html>Home</html>' }));
			const pageRenderer = { loadPageModule, execute };
			const RendererFactory = {
				getPageRenderer: vi.fn(() => pageRenderer),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(loadPageModule).toHaveBeenCalledTimes(1);
			expect(loadPageModule).toHaveBeenCalledWith(filePath);
			expect(loadPageModule.mock.calls[0]?.length).toBe(1);
			expect(execute).toHaveBeenCalledTimes(1);
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/index.html', '<html>Home</html>');
		});

		test('should reuse rendered HTML cache for unchanged static pages', async () => {
			const routeModuleBuildCache = createMockRouteModuleBuildCache({
				canReuseStaticRender: vi.fn(() => true),
			});

			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'lit',
							extensions: ['.lit.tsx'],
						},
					] as EcoPagesAppConfig['integrations'],
				}),
				routeModuleBuildCache,
			});
			const filePath = '/src/pages/index.lit.tsx';
			const Router = createMockRouter({
				'/lit': { filePath, pathname: '/lit' },
			});
			const loadPageModule = vi.fn(async () => createStaticPageModule());
			const execute = vi.fn(async () => ({ body: '<html>Lit render</html>' }));
			const pageRenderer = { loadPageModule, execute };
			const RendererFactory = {
				getPageRenderer: vi.fn(() => pageRenderer),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.generateStaticPages({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RendererFactory,
			});

			expect(routeModuleBuildCache.canReuseStaticRender).toHaveBeenCalled();
			expect(execute).not.toHaveBeenCalled();
			expect(writeMock).not.toHaveBeenCalled();
		});
	});

	describe('run', () => {
		test('should prune stale static outputs during preserved incremental exports', async () => {
			const routeModuleBuildCache = createMockRouteModuleBuildCache({
				pruneStaleRenderedOutputs: vi.fn(() => ['/test/project/dist/removed.html']),
			});
			const existsMock = vi.spyOn(fileSystem, 'exists').mockImplementation((filePath) => {
				return filePath === '/test/project/dist/removed.html';
			});
			const removeMock = vi.spyOn(fileSystem, 'remove').mockImplementation(() => {});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig(),
				routeModuleBuildCache,
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				preserveExportDirectory: true,
			});

			expect(routeModuleBuildCache.pruneStaleRenderedOutputs).toHaveBeenCalled();
			expect(removeMock).toHaveBeenCalledWith('/test/project/dist/removed.html');
			existsMock.mockRestore();
			removeMock.mockRestore();
		});

		test('should list static routes once per run when unified graph prebuild is enabled', async () => {
			const listStaticGenerationRoutes = vi.fn(async () => []);
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig(),
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes,
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
			});

			expect(listStaticGenerationRoutes).toHaveBeenCalledTimes(1);
		});

		test('should build unified graph before integration static export hooks', async () => {
			graphBuildOrder.length = 0;
			ensurePagesUnifiedGraphBuiltMock.mockClear();
			const beforeStaticExport = vi.fn(async () => {
				graphBuildOrder.push('beforeStaticExport');
			});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'lit',
							extensions: ['.lit.tsx'],
							beforeStaticExport,
						},
					] as unknown as EcoPagesAppConfig['integrations'],
				}),
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
			});

			expect(ensurePagesUnifiedGraphBuiltMock).toHaveBeenCalled();
			expect(graphBuildOrder).toEqual(['ensurePagesUnifiedGraphBuilt', 'beforeStaticExport']);
		});

		test('should invoke integration static export hooks around generation', async () => {
			const beforeStaticExport = vi.fn(async () => {});
			const afterStaticExport = vi.fn(async () => {});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'lit',
							extensions: ['.lit.tsx'],
							beforeStaticExport,
							afterStaticExport,
						},
					] as unknown as EcoPagesAppConfig['integrations'],
				}),
			});
			const router = {
				listStaticGenerationRoutes: vi.fn(async () => []),
			} satisfies StaticGenerationRunnerInput['router'];

			await ssg.run({
				router,
				baseUrl: 'http://localhost:3000',
			});

			expect(beforeStaticExport).toHaveBeenCalledWith(
				expect.objectContaining({
					baseUrl: 'http://localhost:3000',
					force: false,
					preserveExportDirectory: false,
					routes: [],
				}),
			);
			expect(afterStaticExport).toHaveBeenCalledWith(
				expect.objectContaining({
					baseUrl: 'http://localhost:3000',
					routes: [],
				}),
			);
			expect(beforeStaticExport.mock.invocationCallOrder[0]).toBeLessThan(
				afterStaticExport.mock.invocationCallOrder[0]!,
			);
		});

		test('should call generateRobotsTxt and generateStaticPages', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = {
				listStaticGenerationRoutes: vi.fn(async () => []),
			} satisfies StaticGenerationRouteSource;

			await ssg.run({
				router: Router,
				baseUrl: 'http://localhost:3000',
			});

			expect(ensureDirMock).toHaveBeenCalled();
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/robots.txt', expect.any(String));
		});

		test('should write sitemap.xml after afterStaticExport when enabled', async () => {
			const afterStaticExport = vi.fn(async () => {});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					baseUrl: 'https://example.com',
					sitemap: {
						enabled: true,
						fileName: 'sitemap.xml',
						extraUrls: ['/rss.xml'],
						exclude: ['/admin/**'],
					},
					integrations: [
						{
							name: 'test',
							extensions: ['.tsx'],
							afterStaticExport,
						},
					] as unknown as EcoPagesAppConfig['integrations'],
				}),
			});

			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => ({
						default: Object.assign(() => null, { cache: 'static' }),
					})),
					execute: vi.fn(async () => ({ body: '<html>Page</html>' })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => [
						{
							requestUrl: 'https://example.com/',
							pathname: '/',
							templateRoute: {
								pathname: '/',
								kind: 'exact' as const,
								filePath: '/src/pages/index.tsx',
								paramNames: [],
							},
							params: {},
						},
						{
							requestUrl: 'https://example.com/admin',
							pathname: '/admin',
							templateRoute: {
								pathname: '/admin',
								kind: 'exact' as const,
								filePath: '/src/pages/admin.tsx',
								paramNames: [],
							},
							params: {},
						},
					]),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: RendererFactory.getPageRenderer,
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
			});

			expect(afterStaticExport).toHaveBeenCalled();
			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(sitemapWrite).toBeDefined();
			const sitemapContent = String(sitemapWrite?.[1]);
			expect(sitemapContent).toContain('<loc>https://example.com/</loc>');
			expect(sitemapContent).toContain('<loc>https://example.com/rss.xml</loc>');
			expect(sitemapContent).not.toContain('/admin');
			const sitemapWriteIndex = writeMock.mock.calls.findIndex((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(afterStaticExport.mock.invocationCallOrder[0]).toBeLessThan(
				writeMock.mock.invocationCallOrder[sitemapWriteIndex]!,
			);
		});

		test('should omit noindex pages and metadata failures from sitemap', async () => {
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					baseUrl: 'https://example.com',
					sitemap: {
						enabled: true,
						fileName: 'sitemap.xml',
						extraUrls: [],
						exclude: [],
					},
				}),
			});

			const RendererFactory = {
				getPageRenderer: vi.fn((filePath: string) => ({
					loadPageModule: vi.fn(async () => {
						if (filePath.includes('draft')) {
							return {
								default: Object.assign(() => null, {
									cache: 'static',
									metadata: async () => ({
										title: 'Draft',
										description: 'Draft',
										robots: { index: false },
									}),
								}),
							};
						}
						if (filePath.includes('broken')) {
							return {
								default: Object.assign(() => null, {
									cache: 'static',
									metadata: async () => {
										throw new Error('metadata boom');
									},
								}),
							};
						}
						return {
							default: Object.assign(() => null, { cache: 'static' }),
						};
					}),
					execute: vi.fn(async () => ({ body: '<html>Page</html>' })),
				})),
			} satisfies StaticPageRouteRendererFactory;

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => [
						{
							requestUrl: 'https://example.com/',
							pathname: '/',
							templateRoute: {
								pathname: '/',
								kind: 'exact' as const,
								filePath: '/src/pages/index.tsx',
								paramNames: [],
							},
							params: {},
						},
						{
							requestUrl: 'https://example.com/draft',
							pathname: '/draft',
							templateRoute: {
								pathname: '/draft',
								kind: 'exact' as const,
								filePath: '/src/pages/draft.tsx',
								paramNames: [],
							},
							params: {},
						},
						{
							requestUrl: 'https://example.com/broken',
							pathname: '/broken',
							templateRoute: {
								pathname: '/broken',
								kind: 'exact' as const,
								filePath: '/src/pages/broken.tsx',
								paramNames: [],
							},
							params: {},
						},
					]),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: RendererFactory.getPageRenderer,
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
			});

			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(sitemapWrite).toBeDefined();
			const sitemapContent = String(sitemapWrite?.[1]);
			expect(sitemapContent).toContain('<loc>https://example.com/</loc>');
			expect(sitemapContent).not.toContain('/draft');
			expect(sitemapContent).not.toContain('/broken');
		});

		test('should honor robots.index on explicit static views in sitemap', async () => {
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					baseUrl: 'https://example.com',
					sitemap: {
						enabled: true,
						fileName: 'sitemap.xml',
						extraUrls: [],
						exclude: [],
					},
				}),
			});
			const renderToResponse = vi.fn(async () => new Response('<html>Private</html>'));
			const privateView = Object.assign(() => null, {
				cache: 'static',
				config: { identity: { ...testInjectedMeta, file: '/src/views/private.tsx' } },
				metadata: async () => ({
					title: 'Private',
					description: 'Private',
					robots: { index: false },
				}),
			}) as any;

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderToResponse,
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/private',
						loader: async () => ({ default: privateView }),
					},
				],
			});

			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(sitemapWrite).toBeDefined();
			expect(String(sitemapWrite?.[1])).not.toContain('/private');
		});

		test('should skip explicit static routes backed by cache dynamic views', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dynamicView = Object.assign(() => null, { cache: 'dynamic' }) as any;

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/dashboard',
						loader: async () => ({ default: dynamicView }),
					},
				],
			});

			expect(writeMock).not.toHaveBeenCalledWith(expect.stringContaining('dashboard'), expect.anything());
		});

		test('should render dynamic explicit static routes from staticPaths', async () => {
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({ baseUrl: 'http://localhost:3000' } as any),
			});
			const renderToResponse = vi.fn(async () => new Response('<html>Post</html>'));
			const staticProps = vi.fn(async ({ pathname }) => ({
				props: pathname.params,
			}));

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderToResponse,
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/blog/[slug]',
						loader: async () => ({
							default: Object.assign(() => null, {
								config: { identity: testInjectedMeta },
								staticPaths: async () => ({ paths: [{ params: { slug: 'hello-world' } }] }),
								staticProps,
							}),
						}),
					},
				],
			});

			expect(staticProps).toHaveBeenCalledWith({
				pathname: { params: { slug: 'hello-world' } },
				appConfig: expect.any(Object),
				runtimeOrigin: 'http://localhost:3000',
			});
			expect(renderToResponse).toHaveBeenCalledWith(expect.any(Function), { slug: 'hello-world' }, {});
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/blog/hello-world.html', '<html>Post</html>');
		});

		test('should log an error for dynamic explicit routes without staticPaths', async () => {
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({ baseUrl: 'http://localhost:3000' } as any),
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderToResponse: vi.fn(),
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/blog/[slug]',
						loader: async () => ({
							default: Object.assign(() => null, {
								config: { identity: testInjectedMeta },
							}),
						}),
					},
				],
			});

			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/blog/hello-world.html', expect.anything());
		});

		test('should skip explicit static pages when the render cache is fresh', async () => {
			const routeModuleBuildCache = createMockRouteModuleBuildCache({
				isIncrementalStaticGenerationAvailable: vi.fn(() => true),
				canReuseStaticRender: vi.fn(() => true),
			});
			vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
			vi.spyOn(fileSystem, 'hash').mockReturnValue('cached-hash');
			const renderToResponse = vi.fn(async () => new Response('<html>Dashboard</html>'));
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({ baseUrl: 'http://localhost:3000' } as any),
				routeModuleBuildCache,
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderToResponse,
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/dashboard',
						loader: async () => ({
							default: Object.assign(() => null, {
								config: { identity: { ...testInjectedMeta, file: '/src/views/dashboard.tsx' } },
							}),
						}),
					},
				],
			});

			expect(renderToResponse).not.toHaveBeenCalled();
			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/dashboard.html', expect.anything());
		});

		test('should regenerate explicit static pages when force is true', async () => {
			const routeModuleBuildCache = createMockRouteModuleBuildCache({
				canReuseStaticRender: vi.fn((options: { force?: boolean }) => !options.force),
			});
			const renderToResponse = vi.fn(async () => new Response('<html>Dashboard</html>'));
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({ baseUrl: 'http://localhost:3000' } as any),
				routeModuleBuildCache,
			});

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				force: true,
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderToResponse,
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/dashboard',
						loader: async () => ({
							default: Object.assign(() => null, {
								config: { identity: { ...testInjectedMeta, file: '/src/views/dashboard.tsx' } },
							}),
						}),
					},
				],
			});

			expect(renderToResponse).toHaveBeenCalled();
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/dashboard.html', '<html>Dashboard</html>');
		});
	});
});
