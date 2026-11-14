import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { EcoPageComponent } from '../types/eco-api-types.ts';
import type { EcoComponent, GetMetadata, GetProps, HtmlTemplateProps } from '../types/contracts.ts';
import type { StaticGenerationRoute } from '../router/server/route-registry.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../constants.ts';
import { createAppRuntime } from '../config/assembly/app-runtime.ts';
import { StaticSiteGenerator } from './static-site-generator.ts';
import { appLogger } from '../global/app-logger.ts';
import {
	TestIntegrationRenderer,
	testAssetService,
} from '../route-renderer/orchestration/integration-renderer.test-fixtures.ts';

const shouldBuildPagesUnifiedGraphMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('../build/cache/pages-unified-graph-build.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../build/cache/pages-unified-graph-build.ts')>();
	return {
		...actual,
		shouldBuildPagesUnifiedGraph: shouldBuildPagesUnifiedGraphMock,
	};
});

const originalEnsureDir = fileSystem.ensureDir;
const originalWrite = fileSystem.write;
const writes: Array<{ filePath: string; contents: string | Buffer }> = [];

const createMockConfig = (): EcoPagesAppConfig => {
	const config = {
		rootDir: '/test/project',
		baseUrl: 'https://example.com',
		distDir: 'dist',
		workDir: DEFAULT_ECOPAGES_WORK_DIR,
		srcDir: 'src',
		defaultMetadata: {
			title: 'Test',
			description: 'Test site',
		},
		robotsTxt: { preferences: {} },
		sitemap: {
			enabled: true,
			fileName: 'sitemap.xml',
			extraUrls: [],
			exclude: [],
		},
		absolutePaths: {
			distDir: '/test/project/dist/client',
			workDir: '/test/project/.eco',
		} as EcoPagesAppConfig['absolutePaths'],
		loaders: new Map(),
		integrations: [],
		processors: new Map(),
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(config, { globalScriptResolution: 'browser-build' });
	return config;
};

describe('StaticSiteGenerator production export', () => {
	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		vi.restoreAllMocks();
	});

	test('runs props once per expanded path, includes each path in the sitemap, and prebuilds no browser graph for an endpoint route', async () => {
		writes.length = 0;
		fileSystem.ensureDir = () => {};
		fileSystem.write = (filePath, contents) => writes.push({ filePath, contents });

		const appConfig = createMockConfig();
		const routeFile = '/src/pages/blog/[slug].tsx';
		type PageProps = { slug: string | string[] | undefined };
		const propsMock = vi.fn(async ({ params }: Parameters<GetProps<PageProps>>[0]) => ({
			slug: params.slug,
		}));
		const props: GetProps<PageProps> = propsMock;
		const metadataMock = vi.fn(async ({ params }: Parameters<GetMetadata>[0]) => {
			if (!params.slug) throw new Error('metadata requires a route slug');
			return { title: String(params.slug), description: 'Route metadata' };
		});
		const metadata: GetMetadata = metadataMock;
		const Page = (({ slug }: PageProps) => `<p>${slug}</p>`) as EcoPageComponent<PageProps>;
		Page.cache = 'static';
		Page.props = props;
		Page.metadata = metadata;
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'static-props-page', file: routeFile, integration: 'test-renderer' },
		};

		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}

		const renderer = new StaticExportRenderer({
			appConfig,
			assetProcessingService: testAssetService,
		});
		const planProductionRoutes = vi.spyOn(renderer, 'planProductionRoutes');
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (({ children }: HtmlTemplateProps) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		const routes = ['first', 'second'].map((slug) => ({
			requestUrl: `https://example.com/blog/${slug}`,
			pathname: `/blog/${slug}`,
			templateRoute: {
				pathname: '/blog/[slug]',
				kind: 'dynamic' as const,
				role: 'page' as const,
				filePath: routeFile,
				paramNames: ['slug'],
			},
			params: { slug },
		})) satisfies StaticGenerationRoute[];
		const ssg = new StaticSiteGenerator({ appConfig });
		vi.stubEnv('NODE_ENV', 'production');

		try {
			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => routes),
					templateRoutes: [
						{
							pathname: '/blog/[slug]',
							kind: 'dynamic',
							role: 'page',
							filePath: routeFile,
							paramNames: ['slug'],
						},
						{
							pathname: '/api/users/[id]',
							kind: 'dynamic',
							role: 'endpoint',
							filePath: '/src/pages/api/users/[id].api.ts',
							paramNames: ['id'],
						},
					],
				},
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => null),
				},
			});
		} finally {
			vi.unstubAllEnvs();
		}

		expect(planProductionRoutes).toHaveBeenCalledTimes(1);
		expect(planProductionRoutes.mock.calls[0]?.[0]).toEqual([
			{ routeFile, params: { slug: 'first' } },
			{ routeFile, params: { slug: 'second' } },
		]);
		expect(planProductionRoutes.mock.calls[0]?.[1]?.onRouteFailure).toEqual(expect.any(Function));
		expect(propsMock).toHaveBeenCalledTimes(2);
		expect(metadataMock).toHaveBeenCalledTimes(2);
		expect(propsMock.mock.calls.map(([context]) => context.params.slug)).toEqual(['first', 'second']);
		expect(writes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filePath: '/test/project/dist/client/blog/first.html' }),
				expect.objectContaining({ filePath: '/test/project/dist/client/blog/second.html' }),
			]),
		);
		const sitemap = writes.find(({ filePath }) => filePath === '/test/project/dist/client/sitemap.xml');
		expect(sitemap?.contents).toContain('<loc>https://example.com/blog/first</loc>');
		expect(sitemap?.contents).toContain('<loc>https://example.com/blog/second</loc>');
	});

	test('fails the build once for a Page that cannot be planned, without rendering it, unless keepGoing is set', async () => {
		writes.length = 0;
		fileSystem.ensureDir = () => {};
		fileSystem.write = (filePath, contents) => writes.push({ filePath, contents });
		const routeFile = '/src/pages/blog/[slug].tsx';
		type PageProps = { slug: string | string[] | undefined };
		const Page = (({ slug }: PageProps) => `<p>${slug}</p>`) as EcoPageComponent<PageProps>;
		Page.props = async ({ params }) => {
			if (params.slug === 'broken') throw new Error('broken static props');
			return { slug: params.slug };
		};
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'unplannable-page', file: routeFile, integration: 'test-renderer' },
		};
		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}
		const templateRoute = {
			pathname: '/blog/[slug]',
			kind: 'dynamic' as const,
			role: 'page' as const,
			filePath: routeFile,
			paramNames: ['slug'],
		};
		const routes = ['healthy', 'broken'].map((slug) => ({
			requestUrl: `https://example.com/blog/${slug}`,
			pathname: `/blog/${slug}`,
			templateRoute,
			params: { slug },
		})) satisfies StaticGenerationRoute[];
		const run = (keepGoing: boolean) => {
			const appConfig = createMockConfig();
			const renderer = new StaticExportRenderer({ appConfig, assetProcessingService: testAssetService });
			renderer.PageModule = { default: Page };
			renderer.HtmlTemplate = (({ children }: HtmlTemplateProps) =>
				`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;
			return new StaticSiteGenerator({ appConfig }).run({
				router: { listStaticGenerationRoutes: vi.fn(async () => routes), templateRoutes: [templateRoute] },
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => null),
				},
				keepGoing,
			});
		};
		vi.stubEnv('NODE_ENV', 'production');

		try {
			const failure = await run(false).catch((error: unknown) => error);
			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as AggregateError).errors).toHaveLength(1);
			expect(String((failure as AggregateError).errors[0])).toContain(
				'Failed to generate static page for https://example.com/blog/broken',
			);

			writes.length = 0;
			await expect(run(true)).resolves.toBeUndefined();
			expect(writes.map(({ filePath }) => filePath)).toContain('/test/project/dist/client/blog/healthy.html');
			expect(writes.map(({ filePath }) => filePath)).not.toContain('/test/project/dist/client/blog/broken.html');
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test('warns about a route template that cannot be planned without request props and keeps building', async () => {
		fileSystem.ensureDir = () => {};
		fileSystem.write = () => {};
		const routeFile = '/src/pages/products/[slug].tsx';
		const Page = (() => '<p>product</p>') as EcoPageComponent<Record<string, unknown>>;
		Page.resolveDependencies = async ({ props }) => {
			if (!props.slug) throw new Error('a product needs its slug');
			return { components: [] };
		};
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'product-template', file: routeFile, integration: 'test-renderer' },
		};
		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}
		const appConfig = createMockConfig();
		const renderer = new StaticExportRenderer({ appConfig, assetProcessingService: testAssetService });
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(appLogger, 'warn');

		try {
			await new StaticSiteGenerator({ appConfig }).run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
					templateRoutes: [
						{
							pathname: '/products/[slug]',
							kind: 'dynamic',
							role: 'page',
							filePath: routeFile,
							paramNames: ['slug'],
						},
					],
				},
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => null),
				},
			});

			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('Could not plan /src/pages/products/[slug].tsx without request props'),
				'a product needs its slug',
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test('plans a dynamic Page once per paths entry without a parameter-free template plan', async () => {
		fileSystem.ensureDir = () => {};
		fileSystem.write = () => {};
		const routeFile = '/src/pages/products/[slug].tsx';
		const Page = (() => '<p>product</p>') as EcoPageComponent<Record<string, unknown>>;
		Page.cache = 'dynamic';
		Page.paths = async () => [{ params: { slug: 'one' } }];
		Page.props = async ({ params }) => ({ slug: params.slug });
		const resolveDependencies = vi.fn(async ({ props }: { props: Record<string, unknown> }) => {
			if (!props.slug) throw new Error('a product needs its slug');
			return { components: [] };
		});
		Page.resolveDependencies = resolveDependencies;
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'product-entries', file: routeFile, integration: 'test-renderer' },
		};
		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}
		const appConfig = createMockConfig();
		const renderer = new StaticExportRenderer({ appConfig, assetProcessingService: testAssetService });
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const templateRoute = {
			pathname: '/products/[slug]',
			kind: 'dynamic' as const,
			role: 'page' as const,
			filePath: routeFile,
			paramNames: ['slug'],
		};
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(appLogger, 'warn');

		try {
			await new StaticSiteGenerator({ appConfig }).run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
					listDynamicPagePathExpansions: vi.fn(async () => [
						{ pathname: '/products/one', templateRoute, params: { slug: 'one' } },
					]),
					templateRoutes: [templateRoute],
				},
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => null),
				},
			});

			expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('without request props'), expect.anything());
			expect(resolveDependencies).toHaveBeenCalled();
			expect(resolveDependencies.mock.calls.every(([{ props }]) => props.slug === 'one')).toBe(true);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test('fails the build for a Dynamic collection Page entry that cannot be planned, naming its file and Params', async () => {
		fileSystem.ensureDir = () => {};
		fileSystem.write = () => {};
		const routeFile = '/src/pages/posts/[slug].tsx';
		const Page = (() => '<p>post</p>') as EcoPageComponent<Record<string, unknown>>;
		Page.cache = 'dynamic';
		Page.props = async ({ params }) => {
			if (params.slug === 'chart') throw new Error('chart data is unavailable');
			return {};
		};
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'post-entry', file: routeFile, integration: 'test-renderer' },
		};
		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}
		const appConfig = createMockConfig();
		const renderer = new StaticExportRenderer({ appConfig, assetProcessingService: testAssetService });
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const templateRoute = {
			pathname: '/posts/[slug]',
			kind: 'dynamic' as const,
			role: 'page' as const,
			filePath: routeFile,
			paramNames: ['slug'],
		};
		vi.stubEnv('NODE_ENV', 'production');

		try {
			const failure = await new StaticSiteGenerator({ appConfig })
				.run({
					router: {
						listStaticGenerationRoutes: vi.fn(async () => []),
						listDynamicPagePathExpansions: vi.fn(async () =>
							['plain', 'chart'].map((slug) => ({
								pathname: `/posts/${slug}`,
								templateRoute,
								params: { slug },
							})),
						),
						templateRoutes: [templateRoute],
					},
					baseUrl: 'https://example.com',
					routeRendererFactory: {
						getPageRenderer: vi.fn((_filePath: string) => renderer),
						getExplicitViewRenderer: vi.fn(() => null),
					},
				})
				.catch((error: unknown) => error);

			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as AggregateError).errors.map(String)).toEqual([
				'Error: Failed to generate route plan for /src/pages/posts/[slug].tsx {"slug":"chart"}',
			]);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test('prebuilds each Dynamic collection Page entry even though HTML is not generated', async () => {
		writes.length = 0;
		fileSystem.ensureDir = () => {};
		fileSystem.write = (filePath, contents) => writes.push({ filePath, contents });

		const appConfig = createMockConfig();
		const routeFile = '/src/pages/posts/[slug].tsx';
		type PageProps = { slug: string | string[] | undefined };
		const Page = (({ slug }: PageProps) => `<p>${slug}</p>`) as EcoPageComponent<PageProps>;
		Page.cache = 'dynamic';
		Page.paths = async () => [{ params: { slug: 'plain' } }, { params: { slug: 'chart' } }];
		Page.props = async ({ params }) => ({ slug: params.slug });
		Page.config = {
			integration: 'test-renderer',
			identity: { id: 'dynamic-collection-page', file: routeFile, integration: 'test-renderer' },
		};

		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}

		const renderer = new StaticExportRenderer({
			appConfig,
			assetProcessingService: testAssetService,
		});
		const planProductionRoutes = vi.spyOn(renderer, 'planProductionRoutes');
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (({ children }: HtmlTemplateProps) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		const ssg = new StaticSiteGenerator({ appConfig });
		vi.stubEnv('NODE_ENV', 'production');

		try {
			await ssg.run({
				router: {
					listStaticGenerationRoutes: vi.fn(async () => []),
					listDynamicPagePathExpansions: vi.fn(async () => [
						{
							pathname: '/posts/plain',
							templateRoute: {
								pathname: '/posts/[slug]',
								kind: 'dynamic' as const,
								role: 'page' as const,
								filePath: routeFile,
								paramNames: ['slug'],
							},
							params: { slug: 'plain' },
						},
						{
							pathname: '/posts/chart',
							templateRoute: {
								pathname: '/posts/[slug]',
								kind: 'dynamic' as const,
								role: 'page' as const,
								filePath: routeFile,
								paramNames: ['slug'],
							},
							params: { slug: 'chart' },
						},
					]),
					templateRoutes: [
						{
							pathname: '/posts/[slug]',
							kind: 'dynamic',
							role: 'page',
							filePath: routeFile,
							paramNames: ['slug'],
						},
					],
				},
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => null),
				},
			});
		} finally {
			vi.unstubAllEnvs();
		}

		expect(planProductionRoutes).toHaveBeenCalledTimes(1);
		expect(planProductionRoutes.mock.calls[0]?.[0]).toEqual([
			{ routeFile, params: { slug: 'chart' } },
			{ routeFile, params: { slug: 'plain' } },
		]);
		expect(writes.some(({ filePath }) => filePath.includes('/posts/'))).toBe(false);
	});

	test('prebuilds browser graphs for explicit static view route instances', async () => {
		writes.length = 0;
		fileSystem.ensureDir = () => {};
		fileSystem.write = (filePath, contents) => writes.push({ filePath, contents });

		const appConfig = createMockConfig();
		const routeFile = '/src/views/archive/[slug].tsx';
		type ViewProps = { slug: string | string[] | undefined };
		const paths = vi.fn(async () => [{ params: { slug: 'spring' } }]);
		const props = vi.fn(async ({ params }: Parameters<GetProps<ViewProps>>[0]) => ({
			slug: params.slug,
		}));
		const view = (({ slug }: ViewProps) => `<p>${slug}</p>`) as EcoPageComponent<ViewProps>;
		view.paths = paths;
		view.props = props;
		view.config = {
			integration: 'test-renderer',
			identity: { id: 'explicit-view', file: routeFile, integration: 'test-renderer' },
		};

		class StaticExportRenderer extends TestIntegrationRenderer {
			protected override async ensureIntegrationRuntimeActivated(): Promise<void> {}
		}

		const renderer = new StaticExportRenderer({
			appConfig,
			assetProcessingService: testAssetService,
		});
		const planProductionRoutes = vi.spyOn(renderer, 'planProductionRoutes');
		renderer.PageModule = { default: view };
		renderer.HtmlTemplate = (({ children }: HtmlTemplateProps) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		const loader = Object.assign(
			vi.fn(async () => ({ default: view })),
			{ filePath: routeFile },
		);
		const ssg = new StaticSiteGenerator({ appConfig });
		vi.stubEnv('NODE_ENV', 'production');

		try {
			await ssg.run({
				router: { listStaticGenerationRoutes: vi.fn(async () => []) },
				baseUrl: 'https://example.com',
				routeRendererFactory: {
					getPageRenderer: vi.fn((_filePath: string) => renderer),
					getExplicitViewRenderer: vi.fn(() => renderer),
				},
				staticRoutes: [{ path: '/archive/[slug]', loader }],
			});
		} finally {
			vi.unstubAllEnvs();
		}

		expect(loader).toHaveBeenCalledTimes(1);
		expect(paths).toHaveBeenCalledTimes(1);
		expect(props).toHaveBeenCalledTimes(2);
		expect(planProductionRoutes).toHaveBeenCalledTimes(1);
		expect(planProductionRoutes.mock.calls[0]?.[0]).toEqual([{ routeFile, params: { slug: 'spring' } }]);
		expect(writes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filePath: '/test/project/dist/client/archive/spring.html' }),
			]),
		);
	});
});
