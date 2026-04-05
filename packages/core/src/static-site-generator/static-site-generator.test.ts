import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { StaticSiteGenerator } from './static-site-generator';
import type { EcoPagesAppConfig } from '../types/internal-types';
import type { FSRouter } from '../router/server/fs-router';
import type { RouteRendererFactory } from '../route-renderer/route-renderer';
import { appLogger } from '../global/app-logger.ts';
import { PageModuleImportService } from '../services/module-loading/page-module-import.service';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;

const createMockConfig = (overrides: Partial<EcoPagesAppConfig> = {}): EcoPagesAppConfig =>
	({
		rootDir: '/test/project',
		distDir: 'dist',
		workDir: DEFAULT_ECOPAGES_WORK_DIR,
		srcDir: 'src',
		robotsTxt: {
			preferences: {
				'*': ['/admin', '/private'],
				Googlebot: ['/no-google'],
			},
		},
		absolutePaths: {
			distDir: '/test/project/dist',
			workDir: '/test/project/.eco',
		} as EcoPagesAppConfig['absolutePaths'],
		integrations: [],
		...overrides,
	}) as EcoPagesAppConfig;

describe('StaticSiteGenerator', () => {
	let ensureDirMock: any;
	let writeMock: any;

	beforeEach(() => {
		ensureDirMock = vi.fn(() => {});
		writeMock = vi.fn(() => {});
		fileSystem.ensureDir = ensureDirMock;
		fileSystem.write = writeMock;
		vi.spyOn(PageModuleImportService.prototype, 'importModule').mockResolvedValue({
			default: Object.assign(() => null, { cache: 'static' }),
		});
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
				routes: Object.fromEntries(
					Object.entries(routes).map(([key, value]) => [key, { ...value, kind: 'exact' }]),
				),
				origin: 'http://localhost:3000',
			}) as unknown as FSRouter;

		test('should filter out dynamic routes containing [', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/static': { filePath: '/src/pages/static.ghtml.ts', pathname: '/static' },
				'/dynamic/[id]': { filePath: '/src/pages/dynamic/[id].ghtml.ts', pathname: '/dynamic/[id]' },
			});

			const RendererFactory = {
				createRenderer: vi.fn(() => ({
					createRoute: vi.fn(async () => ({ body: '<html>Static</html>' })),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(Router, 'http://localhost:3000', RendererFactory);

			expect(writeMock).toHaveBeenCalledTimes(1);
		});

		test('should create directories for nested routes', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/blog/post': { filePath: '/src/pages/blog/post.ghtml.ts', pathname: '/blog/post' },
			});

			const RendererFactory = {
				createRenderer: vi.fn(() => ({
					createRoute: vi.fn(async () => ({ body: '<html>Blog Post</html>' })),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(Router, 'http://localhost:3000', RendererFactory);

			expect(ensureDirMock).toHaveBeenCalled();
		});

		test('should throw error when routeRendererFactory is missing for render strategy', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/page': { filePath: '/src/pages/page.ghtml.ts', pathname: '/page' },
			});

			await ssg.generateStaticPages(Router, 'http://localhost:3000', undefined);
		});

		test('should write index.html for root path', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/': { filePath: '/src/pages/index.ghtml.ts', pathname: '/' },
			});

			const RendererFactory = {
				createRenderer: vi.fn(() => ({
					createRoute: vi.fn(async () => ({ body: '<html>Home</html>' })),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(Router, 'http://localhost:3000', RendererFactory);

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), '<html>Home</html>');
		});

		test('should handle Buffer content from renderer', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/': { filePath: '/src/pages/index.ghtml.ts', pathname: '/' },
			});

			const bufferContent = Buffer.from('<html>Buffer Content</html>');
			const RendererFactory = {
				createRenderer: vi.fn(() => ({
					createRoute: vi.fn(async () => ({ body: bufferContent })),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(Router, 'http://localhost:3000', RendererFactory);

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), bufferContent);
		});

		test('should skip cache dynamic pages during static generation and log a warning', async () => {
			vi.spyOn(PageModuleImportService.prototype, 'importModule').mockResolvedValue({
				default: Object.assign(() => null, { cache: 'dynamic' }),
			});

			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = createMockRouter({
				'/dashboard': { filePath: '/src/pages/dashboard.tsx', pathname: '/dashboard' },
			});

			const RendererFactory = {
				createRenderer: vi.fn(() => ({
					createRoute: vi.fn(async () => ({ body: '<html>Dashboard</html>' })),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(Router, 'http://localhost:3000', RendererFactory);

			expect(RendererFactory.createRenderer).not.toHaveBeenCalled();
			expect(writeMock).not.toHaveBeenCalled();
			expect(appLogger.warn).toHaveBeenCalledWith(
				"Pages with cache: 'dynamic' are not supported in static generation or preview, so they will be skipped\n",
				'➤ /src/pages/dashboard.tsx',
			);
		});
	});

	describe('run', () => {
		test('should call generateRobotsTxt and generateStaticPages', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const Router = {
				routes: {},
				origin: 'http://localhost:3000',
			} as unknown as FSRouter;

			await ssg.run({
				router: Router,
				baseUrl: 'http://localhost:3000',
			});

			expect(ensureDirMock).toHaveBeenCalled();
			expect(writeMock).toHaveBeenCalledWith('/test/project/dist/robots.txt', expect.any(String));
		});

		test('should skip explicit static routes backed by cache dynamic views', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const dynamicView = Object.assign(() => null, { cache: 'dynamic' }) as any;

			await ssg.run({
				router: {
					routes: {},
					origin: 'http://localhost:3000',
				} as unknown as FSRouter,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: {
					getRendererByIntegration: vi.fn(),
				} as unknown as RouteRendererFactory,
				staticRoutes: [
					{
						path: '/dashboard',
						loader: async () => ({ default: dynamicView }),
					},
				],
			});

			expect(appLogger.warn).toHaveBeenCalledWith(
				"Pages with cache: 'dynamic' are not supported in static generation or preview, so they will be skipped\n",
				'➤ /dashboard',
			);
		});
	});
});
