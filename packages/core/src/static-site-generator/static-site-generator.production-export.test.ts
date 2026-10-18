import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoPageComponent } from '../eco/eco.types.ts';
import type { EcoComponent, GetMetadata, GetStaticProps, HtmlTemplateProps } from '../types/public-types.ts';
import type { StaticGenerationRoute } from '../router/server/route-registry.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../constants.ts';
import { createAppRuntime } from '../config/assembly/app-runtime.ts';
import { StaticSiteGenerator } from './static-site-generator.ts';
import {
	TestIntegrationRenderer,
	testAssetService,
} from '../route-renderer/orchestration/integration-renderer.test-fixtures.ts';

const shouldBuildPagesUnifiedGraphMock = vi.hoisted(() => vi.fn(() => false));
const ensurePagesUnifiedGraphBuiltMock = vi.hoisted(() => vi.fn(async () => undefined));

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
const writes: Array<{ filePath: string; contents: string | Buffer }> = [];

const createMockConfig = (): EcoPagesAppConfig => {
	const config = {
		rootDir: '/test/project',
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
			distDir: '/test/project/dist',
			workDir: '/test/project/.eco',
		} as EcoPagesAppConfig['absolutePaths'],
		loaders: new Map(),
		integrations: [],
		processors: new Map(),
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(config);
	return config;
};

describe('StaticSiteGenerator production export', () => {
	afterEach(() => {
		fileSystem.ensureDir = originalEnsureDir;
		fileSystem.write = originalWrite;
		vi.restoreAllMocks();
	});

	test('runs staticProps once per expanded path and includes each path in the sitemap', async () => {
		writes.length = 0;
		fileSystem.ensureDir = () => {};
		fileSystem.write = (filePath, contents) => writes.push({ filePath, contents });

		const appConfig = createMockConfig();
		const routeFile = '/src/pages/blog/[slug].tsx';
		type PageProps = { slug: string | string[] | undefined };
		const staticPropsMock = vi.fn(async ({ pathname }: Parameters<GetStaticProps<PageProps>>[0]) => ({
			props: { slug: pathname.params.slug },
		}));
		const staticProps: GetStaticProps<PageProps> = staticPropsMock;
		const metadataMock = vi.fn(async ({ params }: Parameters<GetMetadata>[0]) => {
			if (!params.slug) throw new Error('metadata requires a route slug');
			return { title: String(params.slug), description: 'Route metadata' };
		});
		const metadata: GetMetadata = metadataMock;
		const Page = (({ slug }: PageProps) => `<p>${slug}</p>`) as EcoPageComponent<PageProps>;
		Page.cache = 'static';
		Page.staticProps = staticProps;
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
		const buildGroupedGraphBuildPlan = vi.spyOn(renderer, 'buildGroupedGraphBuildPlan');
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (({ children }: HtmlTemplateProps) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		const routes = ['first', 'second'].map((slug) => ({
			requestUrl: `https://example.com/blog/${slug}`,
			pathname: `/blog/${slug}`,
			templateRoute: {
				pathname: '/blog/[slug]',
				kind: 'dynamic' as const,
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

		expect(buildGroupedGraphBuildPlan).toHaveBeenCalledTimes(1);
		expect(buildGroupedGraphBuildPlan.mock.calls[0]?.[0]).toEqual([
			{ routeFile, skipStaticProps: true, isRouteTemplate: true },
			{ routeFile, params: { slug: 'first' } },
			{ routeFile, params: { slug: 'second' } },
		]);
		expect(buildGroupedGraphBuildPlan.mock.calls[0]?.[1]?.onRouteFailure).toEqual(expect.any(Function));
		expect(staticPropsMock).toHaveBeenCalledTimes(2);
		expect(metadataMock).toHaveBeenCalledTimes(2);
		expect(staticPropsMock.mock.calls.map(([context]) => context.pathname.params.slug)).toEqual([
			'first',
			'second',
		]);
		expect(writes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filePath: '/test/project/dist/blog/first.html' }),
				expect.objectContaining({ filePath: '/test/project/dist/blog/second.html' }),
			]),
		);
		const sitemap = writes.find(({ filePath }) => filePath === '/test/project/dist/sitemap.xml');
		expect(sitemap?.contents).toContain('<loc>https://example.com/blog/first</loc>');
		expect(sitemap?.contents).toContain('<loc>https://example.com/blog/second</loc>');
	});
});
