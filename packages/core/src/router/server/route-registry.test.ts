import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import { ServerRouteHandler } from '../../adapters/shared/runtime/server-route-handler.ts';
import type { FileSystemResponseMatcher } from '../../adapters/shared/http/fs-server-response-matcher.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.js';
import { RouteRegistry, type RouteRegistryPageModuleAdapter, type TemplateRoute } from './route-registry.ts';

const {
	templatesExt,
	absolutePaths: { pagesDir },
	...appConfig
} = await createFixtureAppConfig();

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
			'/500',
			'/postcss-hmr',
			'/dynamic/[slug]',
			'/catch-all/[...path]',
		]);
	});

	test.each([
		['/products/[id]', '/products/123', { id: '123' }],
		['/products/[...id]', '/products/123/456/789', { id: ['123', '456', '789'] }],
		['/products/[id]', '/products/caf%C3%A9', { id: 'café' }],
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
		expect(result?.requestedPathname).toBe(new URL(`http://localhost:3000${requestPathname}`).pathname);
	});

	it('normalizes paths for routes discovered from page files', async () => {
		const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
		try {
			await fs.writeFile(path.join(pagesDir, 'about.ts'), '');
			const registry = createRegistry({ pagesDir, templatesExt: ['.ts'] });
			await registry.init();

			for (const pathname of ['/about', '/about/', '/about//', 'about']) {
				const result = registry.matchRequest(new URL(pathname, 'http://localhost:3000').href);
				expect(result?.requestedPathname).toBe('/about');
				expect(result?.templateRoute.pathname).toBe('/about');
			}
		} finally {
			await fs.rm(pagesDir, { recursive: true, force: true });
		}
	});

	it('returns HTTP 400 for malformed escapes through filesystem request handling', async () => {
		const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
		try {
			const blogDir = path.join(pagesDir, 'blog');
			await fs.mkdir(blogDir, { recursive: true });
			await fs.writeFile(path.join(blogDir, '[slug].ts'), '');
			const registry = createRegistry({ pagesDir, templatesExt: ['.ts'] });
			await registry.init();
			const fileSystemResponseMatcher = {
				handleMatch: vi.fn(async () => new Response('matched')),
				handleNoMatch: vi.fn(async () => new Response('not found', { status: 404 })),
				renderServerError: vi.fn(async () => new Response('server error', { status: 500 })),
			} as unknown as FileSystemResponseMatcher;
			const handler = new ServerRouteHandler({ router: registry, fileSystemResponseMatcher });

			const response = await handler.handleResponse(new Request('http://localhost:3000/blog/%E0%A4%A'));

			expect(response.status).toBe(400);
			expect(fileSystemResponseMatcher.handleMatch).not.toHaveBeenCalled();
			expect(fileSystemResponseMatcher.handleNoMatch).not.toHaveBeenCalled();
		} finally {
			await fs.rm(pagesDir, { recursive: true, force: true });
		}
	});

	test('includes query parameters in match results', async () => {
		const registry = createRegistry();
		await registry.init();

		(registry as unknown as { templateRouteList: TemplateRoute[] }).templateRouteList = [
			{ pathname: '/page', kind: 'exact', filePath: '/pages/page.ts', paramNames: [] },
		];

		const result = registry.matchRequest('http://localhost:3000/page?sort=asc&page=2');

		expect(result?.query).toEqual({ sort: 'asc', page: '2' });
		expect(registry.matchRequest('http://localhost:3000/page?tag=first&tag=second')?.query).toEqual({
			tag: ['first', 'second'],
		});
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

	describe('dynamic route order', () => {
		const discoverInBothOrders = async (files: string[], assert: (registry: RouteRegistry) => void) => {
			const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
			try {
				for (const file of files) {
					const filePath = path.join(pagesDir, file);
					await fs.mkdir(path.dirname(filePath), { recursive: true });
					await fs.writeFile(filePath, '');
				}

				const discoveredFiles = await fileSystem.glob(['**/*.ts'], { cwd: pagesDir });
				for (const fileOrder of [discoveredFiles, [...discoveredFiles].reverse()]) {
					const globSpy = vi.spyOn(fileSystem, 'glob').mockResolvedValue(fileOrder);
					try {
						const registry = createRegistry({ pagesDir, templatesExt: ['.ts'] });
						await registry.init();
						assert(registry);
					} finally {
						globSpy.mockRestore();
					}
				}
			} finally {
				await fs.rm(pagesDir, { recursive: true, force: true });
			}
		};

		test('prefers a literal segment over a parameter segment', async () => {
			await discoverInBothOrders(['api/[id].ts', '[section]/[slug].ts'], (registry) => {
				const literal = registry.matchRequest('http://localhost:3000/api/5');
				expect(literal?.templateRoute.pathname).toBe('/api/[id]');
				expect(literal?.params).toEqual({ id: '5' });

				const parameter = registry.matchRequest('http://localhost:3000/blog/5');
				expect(parameter?.templateRoute.pathname).toBe('/[section]/[slug]');
				expect(parameter?.params).toEqual({ section: 'blog', slug: '5' });
			});
		});

		test('orders dynamic routes of the same shape by pathname', async () => {
			await discoverInBothOrders(['[section]/[slug].ts', '[a]/[b].ts'], (registry) => {
				expect(registry.templateRoutes.map((route) => route.pathname)).toEqual([
					'/[a]/[b]',
					'/[section]/[slug]',
				]);
			});
		});
	});

	test('prefers the most specific catch-all when several match one request', async () => {
		const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
		const files = [
			'docs/[...slug].ts',
			'docs/forms-react/[...slug].ts',
			'docs/[section]/[...slug].ts',
			'docs/[section]/forms/[...slug].ts',
			'docs/guides/[...slug].ts',
			'docs/x/[...slug].ts',
			'docs/exact.ts',
			'docs/[slug].ts',
		];

		try {
			for (const file of files) {
				const filePath = path.join(pagesDir, file);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, '');
			}

			const discoveredFiles = await fileSystem.glob(['**/*.ts'], { cwd: pagesDir });
			for (const fileOrder of [discoveredFiles, [...discoveredFiles].reverse()]) {
				const globSpy = vi.spyOn(fileSystem, 'glob').mockResolvedValue(fileOrder);
				try {
					const discovered = createRegistry({ pagesDir, templatesExt: ['.ts'] });
					await discovered.init();

					const scoped = discovered.matchRequest('http://localhost:3000/docs/forms-react/getting-started');
					expect(scoped?.templateRoute.pathname).toBe('/docs/forms-react/[...slug]');
					expect(scoped?.params).toEqual({ slug: ['getting-started'] });

					const dynamicPrefix = discovered.matchRequest('http://localhost:3000/docs/forms/getting-started');
					expect(dynamicPrefix?.templateRoute.pathname).toBe('/docs/[section]/[...slug]');
					expect(dynamicPrefix?.params).toEqual({ section: 'forms', slug: ['getting-started'] });

					const staticPrefix = discovered.matchRequest('http://localhost:3000/docs/x/getting-started');
					expect(staticPrefix?.templateRoute.pathname).toBe('/docs/x/[...slug]');

					const earlierStaticPrefix = discovered.matchRequest(
						'http://localhost:3000/docs/guides/forms/getting-started',
					);
					expect(earlierStaticPrefix?.templateRoute.pathname).toBe('/docs/guides/[...slug]');

					expect(discovered.matchRequest('http://localhost:3000/docs/exact')?.templateRoute.pathname).toBe(
						'/docs/exact',
					);
					expect(
						discovered.matchRequest('http://localhost:3000/docs/validation')?.templateRoute.pathname,
					).toBe('/docs/[slug]');
				} finally {
					globSpy.mockRestore();
				}
			}

			const genericPagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
			try {
				for (const file of files.slice(0, 2)) {
					const filePath = path.join(genericPagesDir, file);
					await fs.mkdir(path.dirname(filePath), { recursive: true });
					await fs.writeFile(filePath, '');
				}

				const genericRegistry = createRegistry({ pagesDir: genericPagesDir, templatesExt: ['.ts'] });
				await genericRegistry.init();
				const generic = genericRegistry.matchRequest('http://localhost:3000/docs/validation');
				expect(generic?.templateRoute.pathname).toBe('/docs/[...slug]');
				const general = genericRegistry.matchRequest('http://localhost:3000/docs/forms/validation');
				expect(general?.templateRoute.pathname).toBe('/docs/[...slug]');
			} finally {
				await fs.rm(genericPagesDir, { recursive: true, force: true });
			}
		} finally {
			await fs.rm(pagesDir, { recursive: true, force: true });
		}
	});

	test('rejects two Page files that define the same route', async () => {
		const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
		try {
			await fs.mkdir(path.join(pagesDir, 'about'));
			await fs.writeFile(path.join(pagesDir, 'about.html'), '');
			await fs.writeFile(path.join(pagesDir, 'about', 'index.html'), '');

			await expect(createRegistry({ pagesDir, templatesExt: ['.html'] }).init()).rejects.toThrow(
				'both define the route "/about"',
			);
		} finally {
			await fs.rm(pagesDir, { recursive: true, force: true });
		}
	});

	test.each(['[slug].html', '[...slug].html', 'blog/[slug]/index.html'])(
		'rejects %p for an Integration without route params, and accepts it for one with them',
		async (file) => {
			const pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-route-pages-'));
			try {
				await fs.mkdir(path.dirname(path.join(pagesDir, file)), { recursive: true });
				await fs.writeFile(path.join(pagesDir, file), '');
				const withIntegration = (integration: object) =>
					createRegistry({
						pagesDir,
						templatesExt: ['.html'],
						appConfig: { ...appConfig, integrations: [integration] } as EcoPagesAppConfig,
					});

				await expect(createRegistry({ pagesDir, templatesExt: ['.html'] }).init()).rejects.toThrow(
					'.html Pages cannot receive Params',
				);
				await expect(
					withIntegration({ name: 'templates', extensions: ['.html'], acceptsParams: false }).init(),
				).rejects.toThrow('.html Pages cannot receive Params');

				const userOwned = withIntegration({ name: 'custom-html', extensions: ['.html'], acceptsParams: true });
				await userOwned.init();
				expect(userOwned.templateRoutes).toHaveLength(1);
			} finally {
				await fs.rm(pagesDir, { recursive: true, force: true });
			}
		},
	);

	test('strips the longest template extension the file ends with, regardless of registration order', async () => {
		const globSpy = vi
			.spyOn(fileSystem, 'glob')
			.mockResolvedValue(['about.kita.tsx', 'notes.mdx', 'my.html-tips.html', 'v1.2.html']);
		try {
			const registry = createRegistry({ templatesExt: ['.tsx', '.kita.tsx', '.md', '.mdx', '.html'] });
			await registry.init();

			expect(registry.templateRoutes.map((route) => route.pathname).sort()).toEqual([
				'/about',
				'/my.html-tips',
				'/notes',
				'/v1.2',
			]);
		} finally {
			globSpy.mockRestore();
		}
	});

	test('classifies routes by their path inside the pages directory', async () => {
		const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-[client]-'));
		const pagesDir = path.join(projectDir, 'pages');
		try {
			await fs.mkdir(pagesDir);
			await fs.writeFile(path.join(pagesDir, 'about.html'), '');
			const registry = createRegistry({ pagesDir, templatesExt: ['.html'] });
			await registry.init();

			expect(registry.templateRoutes.map((route) => route.kind)).toEqual(['exact']);
		} finally {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	test('keeps one route when overlapping extension globs return the same file twice', async () => {
		const globSpy = vi.spyOn(fileSystem, 'glob').mockResolvedValue(['about.kita.tsx', 'about.kita.tsx']);
		try {
			const registry = createRegistry({ templatesExt: ['.kita.tsx', '.tsx'] });
			await registry.init();

			expect(registry.templateRoutes.map((route) => route.pathname)).toEqual(['/about']);
		} finally {
			globSpy.mockRestore();
		}
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
