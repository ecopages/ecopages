import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';
import { StaticSiteGenerator } from './static-site-generator';
import type { EcoPagesAppConfig } from '../internal-types';
import type { FSRouter } from '../router/fs-router';
import type { RouteRendererFactory } from '../route-renderer/route-renderer';

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;

const createMockConfig = (overrides: Partial<EcoPagesAppConfig> = {}): EcoPagesAppConfig =>
	({
		rootDir: '/test/project',
		distDir: '.eco/public',
		srcDir: 'src',
		robotsTxt: {
			preferences: {
				'*': ['/admin', '/private'],
				Googlebot: ['/no-google'],
			},
		},
		integrations: [],
		...overrides,
	}) as EcoPagesAppConfig;

describe('StaticSiteGenerator', () => {
	let ensureDirMock: ReturnType<typeof mock>;
	let writeMock: ReturnType<typeof mock>;

	beforeEach(() => {
		ensureDirMock = mock(() => {});
		writeMock = mock(() => {});
		fileSystem.ensureDir = ensureDirMock;
		fileSystem.write = writeMock;
	});

	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		mock.restore();
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

			expect(ensureDirMock).toHaveBeenCalledWith('.eco/public');
			expect(writeMock).toHaveBeenCalledWith('.eco/public/robots.txt', expect.any(String));

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

			expect(writeMock).toHaveBeenCalledWith('.eco/public/robots.txt', '');
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
			const mockRouter = createMockRouter({
				'/static': { filePath: '/src/pages/static.ghtml.ts', pathname: '/static' },
				'/dynamic/[id]': { filePath: '/src/pages/dynamic/[id].ghtml.ts', pathname: '/dynamic/[id]' },
			});

			const mockRendererFactory = {
				createRenderer: mock(() => ({
					createRoute: mock(async () => '<html>Static</html>'),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(mockRouter, 'http://localhost:3000', mockRendererFactory);

			expect(writeMock).toHaveBeenCalledTimes(1);
		});

		test('should create directories for nested routes', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const mockRouter = createMockRouter({
				'/blog/post': { filePath: '/src/pages/blog/post.ghtml.ts', pathname: '/blog/post' },
			});

			const mockRendererFactory = {
				createRenderer: mock(() => ({
					createRoute: mock(async () => '<html>Blog Post</html>'),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(mockRouter, 'http://localhost:3000', mockRendererFactory);

			expect(ensureDirMock).toHaveBeenCalled();
		});

		test('should throw error when routeRendererFactory is missing for render strategy', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const mockRouter = createMockRouter({
				'/page': { filePath: '/src/pages/page.ghtml.ts', pathname: '/page' },
			});

			await ssg.generateStaticPages(mockRouter, 'http://localhost:3000', undefined);
		});

		test('should write index.html for root path', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const mockRouter = createMockRouter({
				'/': { filePath: '/src/pages/index.ghtml.ts', pathname: '/' },
			});

			const mockRendererFactory = {
				createRenderer: mock(() => ({
					createRoute: mock(async () => '<html>Home</html>'),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(mockRouter, 'http://localhost:3000', mockRendererFactory);

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), '<html>Home</html>');
		});

		test('should handle Buffer content from renderer', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const mockRouter = createMockRouter({
				'/': { filePath: '/src/pages/index.ghtml.ts', pathname: '/' },
			});

			const bufferContent = Buffer.from('<html>Buffer Content</html>');
			const mockRendererFactory = {
				createRenderer: mock(() => ({
					createRoute: mock(async () => bufferContent),
				})),
			} as unknown as RouteRendererFactory;

			await ssg.generateStaticPages(mockRouter, 'http://localhost:3000', mockRendererFactory);

			expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('index.html'), bufferContent);
		});
	});

	describe('run', () => {
		test('should call generateRobotsTxt and generateStaticPages', async () => {
			const ssg = new StaticSiteGenerator({ appConfig: createMockConfig() });
			const mockRouter = {
				routes: {},
				origin: 'http://localhost:3000',
			} as unknown as FSRouter;

			await ssg.run({
				router: mockRouter,
				baseUrl: 'http://localhost:3000',
			});

			expect(ensureDirMock).toHaveBeenCalled();
			expect(writeMock).toHaveBeenCalledWith('.eco/public/robots.txt', expect.any(String));
		});
	});
});
