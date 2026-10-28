import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { StaticSiteGenerator } from './static-site-generator';
import type { EcoPagesAppConfig } from '../config/internal-types';
import { appLogger } from '../global/app-logger.ts';
import { createMockConfig } from './static-site-generator.test-utils.ts';

const graphBuildOrder: string[] = [];
const resolveBuildParallelismMock = vi.hoisted(() => vi.fn(() => 2));
const shouldBuildPagesUnifiedGraphMock = vi.hoisted(() => vi.fn(() => true));
const emitProductionServerModulesMock = vi.hoisted(() =>
	vi.fn(async () => {
		graphBuildOrder.push('emitProductionServerModules');
		return { outdir: '/test/project/dist/.server', modules: {} };
	}),
);

vi.mock('../build/cache/pages-unified-graph-build.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../build/cache/pages-unified-graph-build.ts')>();
	return {
		...actual,
		emitProductionServerModules: emitProductionServerModulesMock,
		shouldBuildPagesUnifiedGraph: shouldBuildPagesUnifiedGraphMock,
	};
});

vi.mock('../build/build-parallelism.ts', () => ({
	resolveBuildParallelism: resolveBuildParallelismMock,
}));

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;

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

describe('StaticSiteGenerator', () => {
	let ensureDirMock: any;
	let writeMock: any;

	beforeEach(() => {
		ensureDirMock = vi.fn(() => {});
		writeMock = vi.fn(() => {});
		resolveBuildParallelismMock.mockClear();
		emitProductionServerModulesMock.mockClear();
		fileSystem.ensureDir = ensureDirMock;
		fileSystem.write = writeMock;
		vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
	});

	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		vi.restoreAllMocks();
	});

	describe('getDirectories', () => {
		test.each([
			{ name: 'root-level routes', routes: ['/about', '/contact'], directories: [] },
			{ name: 'nested routes', routes: ['/blog/post-1', '/docs/api'], directories: ['/blog', '/docs'] },
			{
				name: 'absolute URLs by their pathname',
				routes: ['http://localhost:3000/blog/post'],
				directories: ['/blog'],
			},
			{ name: 'siblings once', routes: ['/blog/a', '/blog/b', '/blog/c'], directories: ['/blog'] },
			{ name: 'deeply nested paths', routes: ['/a/b/c/page'], directories: ['/a/b/c'] },
		])('lists directories for $name', ({ routes, directories }) => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });

			expect(ssg.getDirectories(routes)).toEqual(directories);
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
								role: 'page' as const,
								paramNames: [],
							},
							params: {},
						})),
				),
			}) satisfies StaticGenerationRouteSource;

		const createStaticPageModule = () => ({
			default: Object.assign(() => null, { cache: 'static' }),
		});

		test('uses the shared build parallelism for static export', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/static': { filePath: '/src/pages/static.ts', pathname: '/static' },
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

			expect(resolveBuildParallelismMock).toHaveBeenCalledOnce();
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

		test('should reject when routeRendererFactory is missing for render strategy', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/page': { filePath: '/src/pages/page.ts', pathname: '/page' },
			});

			await expect(
				ssg.generateStaticPages({
					router: Router,
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: undefined,
				}),
			).rejects.toMatchObject({
				message: 'Failed to generate 1 static page(s)',
				errors: [
					expect.objectContaining({
						message: 'Failed to generate static page for http://localhost:3000/page',
					}),
				],
			});

			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating static page for http://localhost:3000/page:',
				expect.objectContaining({ message: 'RouteRendererFactory is required for render strategy' }),
			);
			expect(writeMock).not.toHaveBeenCalled();
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
	});

	describe('run', () => {
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

		test('emits explicit views when there are no filesystem Pages', async () => {
			const view = Object.assign(() => null, {
				cache: 'static' as const,
				config: { identity: { ...testInjectedMeta, file: '/src/views/hello.ts' } },
			});
			const loader = Object.assign(async () => ({ default: view }), {
				filePath: '/src/views/hello.ts',
			});
			const staticRoutes = [{ path: '/hello', loader }];
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'test',
							extensions: ['.ts'],
						},
					] as unknown as EcoPagesAppConfig['integrations'],
				}),
			});

			await ssg.run({
				router: {
					templateRoutes: [],
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				staticRoutes,
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderExplicitView: vi.fn(),
						executeExplicitView: vi.fn(async () => ({
							body: '<html>Hello</html>',
							metadata: { title: 'Test', description: 'Test site' },
						})),
					})),
				} satisfies StaticGenerationRendererFactory,
			});

			expect(emitProductionServerModulesMock).toHaveBeenCalledWith(
				expect.objectContaining({
					router: { templateRoutes: [] },
					staticRoutes,
				}),
			);
		});

		test('emits Pages listed by the route source when templateRoutes is omitted', async () => {
			const templateRoute = {
				filePath: '/src/pages/about.tsx',
				pathname: '/about',
				kind: 'exact' as const,
				role: 'page' as const,
				paramNames: [],
			};
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => [
						{
							requestUrl: 'http://localhost:3000/about',
							pathname: '/about',
							templateRoute,
							params: {},
						},
					]),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(() => ({
						loadPageModule: vi.fn(async () => ({
							default: Object.assign(() => null, { cache: 'static' }),
						})),
						execute: vi.fn(async () => ({
							body: '<html>About</html>',
							metadata: { title: 'Test', description: 'Test site' },
						})),
					})),
					getExplicitViewRenderer: vi.fn(() => null),
				} satisfies StaticGenerationRendererFactory,
			});

			expect(emitProductionServerModulesMock).toHaveBeenCalledWith(
				expect.objectContaining({
					router: { templateRoutes: [templateRoute] },
				}),
			);
		});

		test('emits production server modules before integration static export hooks', async () => {
			graphBuildOrder.length = 0;
			emitProductionServerModulesMock.mockClear();
			const staticExport = vi.fn(async () => {
				graphBuildOrder.push('staticExport');
			});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'lit',
							extensions: ['.lit.tsx'],
							staticExport,
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

			expect(emitProductionServerModulesMock).toHaveBeenCalled();
			expect(graphBuildOrder).toEqual(['emitProductionServerModules', 'staticExport']);
		});

		test('should invoke the integration staticExport hook with the export context', async () => {
			const staticExport = vi.fn(async () => {});
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({
					integrations: [
						{
							name: 'lit',
							extensions: ['.lit.tsx'],
							staticExport,
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

			expect(staticExport).toHaveBeenCalledWith(
				expect.objectContaining({
					baseUrl: 'http://localhost:3000',
					force: false,
					routes: [],
				}),
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

		test('should collect filesystem and explicit page failures after exporting remaining pages', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const releaseExport = vi.fn(async () => {});
			const appConfig = createMockConfig({
				sitemap: { enabled: true, fileName: 'sitemap.xml', extraUrls: [], exclude: [] },
				integrations: [
					{
						name: 'test',
						extensions: ['.tsx'],
						staticExport: async () => releaseExport,
					},
				] as unknown as EcoPagesAppConfig['integrations'],
			});
			const ssg = new StaticSiteGenerator({ appConfig });
			const explicitView = Object.assign(() => null, {
				config: { identity: { ...testInjectedMeta, file: '/src/views/explicit.tsx' } },
			});

			await expect(
				ssg.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => [
							{
								requestUrl: 'http://localhost:3000/broken',
								pathname: '/broken',
								templateRoute: {
									filePath: '/src/pages/broken.tsx',
									pathname: '/broken',
									kind: 'exact' as const,
									role: 'page' as const,
									paramNames: [],
								},
								params: {},
							},
							{
								requestUrl: 'http://localhost:3000/works',
								pathname: '/works',
								templateRoute: {
									filePath: '/src/pages/works.tsx',
									pathname: '/works',
									kind: 'exact' as const,
									role: 'page' as const,
									paramNames: [],
								},
								params: {},
							},
						]),
					} satisfies StaticGenerationRunnerInput['router'],
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: {
						getPageRenderer: vi.fn((filePath) => ({
							loadPageModule: vi.fn(async () => ({
								default: Object.assign(() => null, { cache: 'static' }),
							})),
							execute: vi.fn(async () => {
								if (filePath.endsWith('/broken.tsx')) throw new Error('filesystem page failed');
								return { body: '<html>Works</html>', metadata: appConfig.defaultMetadata };
							}),
						})),
						getExplicitViewRenderer: vi.fn(() => ({
							renderExplicitView: vi.fn(),
							executeExplicitView: vi.fn(async () => {
								throw new Error('explicit page failed');
							}),
						})),
					} satisfies StaticGenerationRendererFactory,
					staticRoutes: [{ path: '/manual', loader: async () => ({ default: explicitView }) }],
				}),
			).rejects.toMatchObject({
				message: 'Failed to generate 2 static page(s)',
				errors: expect.arrayContaining([
					expect.objectContaining({
						message: 'Failed to generate static page for http://localhost:3000/broken',
					}),
					expect.objectContaining({ message: 'Failed to generate explicit static page for /manual' }),
				]),
			});

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/works.html', '<html>Works</html>');
			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/broken.html', expect.anything());
			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/manual.html', expect.anything());
			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			const sitemapContent = String(sitemapWrite?.[1]);
			expect(sitemapContent).toContain('http://localhost:3000/works');
			expect(sitemapContent).not.toContain('/broken');
			expect(sitemapContent).not.toContain('/manual');
			expect(releaseExport).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating static page for http://localhost:3000/broken:',
				expect.objectContaining({ message: 'filesystem page failed' }),
			);
			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating explicit static page for /manual:',
				expect.objectContaining({ message: 'explicit page failed' }),
			);
		});

		test('should continue after page failures when keepGoing is enabled', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => [
						{
							requestUrl: 'http://localhost:3000/broken',
							pathname: '/broken',
							templateRoute: {
								filePath: '/src/pages/broken.tsx',
								pathname: '/broken',
								kind: 'exact' as const,
								role: 'page' as const,
								paramNames: [],
							},
							params: {},
						},
						{
							requestUrl: 'http://localhost:3000/works',
							pathname: '/works',
							templateRoute: {
								filePath: '/src/pages/works.tsx',
								pathname: '/works',
								kind: 'exact' as const,
								role: 'page' as const,
								paramNames: [],
							},
							params: {},
						},
					]),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn((filePath) => ({
						loadPageModule: vi.fn(async () => ({
							default: Object.assign(() => null, { cache: 'static' }),
						})),
						execute: vi.fn(async () => {
							if (filePath.endsWith('/broken.tsx')) throw new Error('filesystem page failed');
							return { body: '<html>Works</html>' };
						}),
					})),
					getExplicitViewRenderer: vi.fn(),
				} satisfies StaticGenerationRendererFactory,
				keepGoing: true,
			});

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/works.html', '<html>Works</html>');
			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/broken.html', expect.anything());
			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating static page for http://localhost:3000/broken:',
				expect.objectContaining({ message: 'filesystem page failed' }),
			);
		});

		test('should emit built-in semantic error pages when no custom pages are configured', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
			});

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/404.html', expect.stringContaining('Not Found'));
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/403.html', expect.stringContaining('Forbidden'));
			expect(writeMock).toHaveBeenCalledWith(
				'/test/project/dist/500.html',
				expect.stringContaining('Something went wrong'),
			);
		});

		test('should emit registered semantic error views through the explicit renderer', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const view = Object.assign(() => null, {
				config: { identity: { integration: 'fixture', file: '/src/views/not-found.tsx' } },
			});
			const renderExplicitView = vi.fn(async () => new Response('<html>Registered not found</html>'));

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({ renderExplicitView, executeExplicitView: vi.fn() })),
				} satisfies StaticGenerationRendererFactory,
				errorPageLoaders: {
					notFound: async () => ({ default: view as never }),
				},
			});

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/404.html', '<html>Registered not found</html>');
			expect(renderExplicitView).toHaveBeenCalledWith(expect.anything(), { status: 404 }, { status: 404 });
		});

		test('should fail the build when a registered semantic error view breaks', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });

			await expect(
				ssg.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => []),
					} satisfies StaticGenerationRunnerInput['router'],
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: {
						getPageRenderer: vi.fn(),
						getExplicitViewRenderer: vi.fn(),
					} satisfies StaticGenerationRendererFactory,
					errorPageLoaders: {
						notFound: async () => {
							throw new Error('broken not-found view');
						},
					},
				}),
			).rejects.toThrow('broken not-found view');
		});

		test('should write sitemap.xml after every page when enabled', async () => {
			const appConfig = createMockConfig({
				baseUrl: 'https://example.com',
				sitemap: {
					enabled: true,
					fileName: 'sitemap.xml',
					extraUrls: ['/rss.xml'],
					exclude: ['/admin/**'],
				},
			});
			const ssg = new StaticSiteGenerator({ appConfig });

			const RendererFactory = {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => ({
						default: Object.assign(() => null, { cache: 'static' }),
					})),
					execute: vi.fn(async () => ({ body: '<html>Page</html>', metadata: appConfig.defaultMetadata })),
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
								role: 'page' as const,
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
								role: 'page' as const,
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
				keepGoing: true,
			});

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
			const pageWriteOrders = writeMock.mock.calls.flatMap((call: unknown[], index: number) =>
				String(call[0]).endsWith('.html') ? [writeMock.mock.invocationCallOrder[index]!] : [],
			);
			expect(pageWriteOrders.length).toBeGreaterThan(0);
			for (const pageWriteOrder of pageWriteOrders) {
				expect(pageWriteOrder).toBeLessThan(writeMock.mock.invocationCallOrder[sitemapWriteIndex]!);
			}
		});

		test('uses rendered metadata for sitemap eligibility without resolving it again', async () => {
			const metadataError = new Error('metadata boom');
			const draftMetadata = vi.fn(async () => ({
				title: 'Draft',
				description: 'Draft',
				robots: { index: false },
			}));
			const brokenMetadata = vi.fn(async () => {
				throw metadataError;
			});
			const metadataByFile = new Map([
				['/src/pages/draft.tsx', draftMetadata],
				['/src/pages/broken.tsx', brokenMetadata],
			]);
			const appConfig = createMockConfig({
				baseUrl: 'https://example.com',
				sitemap: {
					enabled: true,
					fileName: 'sitemap.xml',
					extraUrls: [],
					exclude: [],
				},
			});
			const ssg = new StaticSiteGenerator({ appConfig });

			const RendererFactory = {
				getPageRenderer: vi.fn((_filePath: string) => ({
					loadPageModule: vi.fn(async () => {
						return {
							default: Object.assign(() => null, { cache: 'static' }),
						};
					}),
					execute: vi.fn(async ({ file }: { file: string }) => ({
						body: '<html>Page</html>',
						metadata: (await metadataByFile.get(file)?.()) ?? appConfig.defaultMetadata,
					})),
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
								role: 'page' as const,
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
								role: 'page' as const,
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
								role: 'page' as const,
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
				keepGoing: true,
			});

			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(sitemapWrite).toBeDefined();
			const sitemapContent = String(sitemapWrite?.[1]);
			expect(sitemapContent).toContain('<loc>https://example.com/</loc>');
			expect(sitemapContent).not.toContain('/draft');
			expect(sitemapContent).not.toContain('/broken');
			expect(draftMetadata).toHaveBeenCalledTimes(1);
			expect(brokenMetadata).toHaveBeenCalledTimes(1);
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
			const executeExplicitView = vi.fn(async () => ({
				body: '<html>Private</html>',
				metadata: { title: 'Private', description: 'Private', robots: { index: false } },
			}));
			const metadata = vi.fn(async () => ({
				title: 'Private',
				description: 'Private',
				robots: { index: false },
			}));
			const privateView = Object.assign(() => null, {
				cache: 'static',
				config: { identity: { ...testInjectedMeta, file: '/src/views/private.tsx' } },
				metadata,
			}) as any;

			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
				} satisfies StaticGenerationRunnerInput['router'],
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn(),
					getExplicitViewRenderer: vi.fn(() => ({
						renderExplicitView: vi.fn(),
						executeExplicitView,
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path: '/private',
						loader: async () => ({ default: privateView }),
					},
				],
			});

			expect(executeExplicitView).toHaveBeenCalledTimes(1);

			const sitemapWrite = writeMock.mock.calls.find((call: unknown[]) =>
				String(call[0]).endsWith('sitemap.xml'),
			);
			expect(sitemapWrite).toBeDefined();
			expect(String(sitemapWrite?.[1])).not.toContain('/private');
			expect(metadata).not.toHaveBeenCalled();
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
			const executeExplicitView = vi.fn(async () => ({ body: '<html>Post</html>' }));
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
						renderExplicitView: vi.fn(),
						executeExplicitView,
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
			expect(staticProps).toHaveBeenCalledTimes(1);
			expect(executeExplicitView).toHaveBeenCalledWith(
				expect.any(Function),
				{ slug: 'hello-world' },
				{
					params: { slug: 'hello-world' },
				},
			);
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/blog/hello-world.html', '<html>Post</html>');
		});

		test.each([
			{
				name: 'a colon catch-all',
				path: '/docs/:...path',
				params: [{ path: ['guide', 'intro'] }, { path: ['api'] }],
				files: ['/test/project/dist/docs/guide/intro.html', '/test/project/dist/docs/api.html'],
			},
			{
				name: 'a bracket catch-all',
				path: '/docs/[...path]',
				params: [{ path: ['guide', 'intro'] }],
				files: ['/test/project/dist/docs/guide/intro.html'],
			},
			{
				name: 'params where one name prefixes another',
				path: '/:idx/:id',
				params: [{ id: '2', idx: '1x' }],
				files: ['/test/project/dist/1x/2.html'],
			},
			{
				name: 'bracket and colon params together',
				path: '/blog/[slug]/:lang',
				params: [{ slug: 'hello', lang: 'en' }],
				files: ['/test/project/dist/blog/hello/en.html'],
			},
		])('should write one file per staticPaths entry for $name', async ({ path, params, files }) => {
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
						renderExplicitView: vi.fn(),
						executeExplicitView: vi.fn(async () => ({ body: '<html>Page</html>' })),
					})),
				} satisfies StaticGenerationRendererFactory,
				staticRoutes: [
					{
						path,
						loader: async () => ({
							default: Object.assign(() => null, {
								config: { identity: testInjectedMeta },
								staticPaths: async () => ({ paths: params.map((entry) => ({ params: entry })) }),
								staticProps: async () => ({ props: {} }),
							}),
						}),
					},
				],
			});

			const written = (writeMock.mock.calls as [string, string][])
				.map(([file]) => file)
				.filter((file) => file.endsWith('.html'));
			expect(written.filter((file) => files.includes(file)).sort()).toEqual([...files].sort());
		});

		test.each([false, true])(
			'should continue exporting explicit staticPaths after one entry fails (keepGoing=%s)',
			async (keepGoing) => {
				const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
				const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
				const executeExplicitView = vi
					.fn()
					.mockRejectedValueOnce(new Error('first static path failed'))
					.mockResolvedValueOnce({ body: '<html>Second post</html>' });
				const view = Object.assign(() => null, {
					config: { identity: testInjectedMeta },
					staticPaths: async () => ({
						paths: [{ params: { slug: 'broken' } }, { params: { slug: 'works' } }],
					}),
				});

				const generation = ssg.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => []),
					} satisfies StaticGenerationRunnerInput['router'],
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: {
						getPageRenderer: vi.fn(),
						getExplicitViewRenderer: vi.fn(() => ({
							renderExplicitView: vi.fn(),
							executeExplicitView,
						})),
					} satisfies StaticGenerationRendererFactory,
					staticRoutes: [{ path: '/blog/[slug]', loader: async () => ({ default: view }) }],
					keepGoing,
				});
				if (keepGoing) {
					await expect(generation).resolves.toBeUndefined();
				} else {
					await expect(generation).rejects.toMatchObject({
						message: 'Failed to generate 1 static page(s)',
						errors: [
							expect.objectContaining({
								message: 'Failed to generate explicit static page for /blog/broken',
							}),
						],
					});
				}

				expect(executeExplicitView).toHaveBeenCalledTimes(2);
				expect(writeMock).toHaveBeenCalledWith(
					'/test/project/dist/blog/works.html',
					'<html>Second post</html>',
				);
				expect(errorSpy).toHaveBeenCalledWith(
					'Error generating explicit static page for /blog/broken:',
					expect.objectContaining({ message: 'first static path failed' }),
				);
			},
		);

		test('keeps exporting other explicit routes when one view has no renderer (keepGoing)', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const view = Object.assign(() => null, { config: { identity: testInjectedMeta } });
			const getExplicitViewRenderer = vi
				.fn()
				.mockReturnValueOnce(undefined)
				.mockReturnValue({
					renderExplicitView: vi.fn(),
					executeExplicitView: vi.fn(async () => ({ body: '<html>Works</html>' })),
				});

			await expect(
				ssg.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => []),
					} satisfies StaticGenerationRunnerInput['router'],
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: {
						getPageRenderer: vi.fn(),
						getExplicitViewRenderer,
					} satisfies StaticGenerationRendererFactory,
					staticRoutes: [
						{ path: '/broken', loader: async () => ({ default: view }) },
						{ path: '/works', loader: async () => ({ default: view }) },
					],
					keepGoing: true,
				}),
			).resolves.toBeUndefined();

			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/works.html', '<html>Works</html>');
			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating explicit static page for /broken:',
				expect.objectContaining({ message: expect.stringContaining('No renderer found for integration') }),
			);
		});

		test('should reject for dynamic explicit routes without staticPaths', async () => {
			const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
			const ssg = new StaticSiteGenerator({
				appConfig: createMockConfig({ baseUrl: 'http://localhost:3000' } as any),
			});

			await expect(
				ssg.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => []),
					} satisfies StaticGenerationRunnerInput['router'],
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: {
						getPageRenderer: vi.fn(),
						getExplicitViewRenderer: vi.fn(() => ({
							renderExplicitView: vi.fn(),
							executeExplicitView: vi.fn(),
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
				}),
			).rejects.toMatchObject({ message: 'Failed to generate 1 static page(s)' });

			expect(errorSpy).toHaveBeenCalledWith(
				'Error generating explicit static page for /blog/[slug]:',
				expect.objectContaining({
					message: 'Dynamic route /blog/[slug] requires staticPaths to be defined on the view.',
				}),
			);
			expect(writeMock).not.toHaveBeenCalledWith('/test/project/dist/blog/hello-world.html', expect.anything());
		});
	});
});
