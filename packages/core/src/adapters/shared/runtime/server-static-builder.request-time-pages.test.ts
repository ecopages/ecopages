import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { StaticGenerationRendererResolver } from '../../../route-renderer/route-renderer.ts';
import type { StaticSiteGenerator } from '../../../static-site-generator/static-site-generator.ts';
import { ServerStaticBuilder } from './server-static-builder.ts';

const events: string[] = [];

vi.mock('../../../build/cache/pages-unified-graph-build.ts', () => ({
	shouldBuildPagesUnifiedGraph: () => true,
	emitProductionServerModules: vi.fn(async () => {
		events.push('emit');
	}),
}));
vi.mock('../../../build/app-build-manifest-runtime.ts', () => ({
	setupAppRuntimeIntegrations: vi.fn(async () => {}),
}));
vi.mock('../../../build/production-route-list.ts', () => ({ writeProductionRouteList: vi.fn() }));
vi.mock('../../../build/copy-server-files.ts', () => ({
	copyDeclaredServerFiles: vi.fn(async () => {
		events.push('files');
	}),
}));
vi.mock('../../../build/production-asset-ledger.ts', () => ({ writeProductionAssetLedger: vi.fn() }));
vi.mock('../../../html-pages/html-page-module-scripts.ts', () => ({
	getPrebuiltHtmlPageModuleScriptUrls: vi.fn(async () => []),
}));

type BundleStep = { bundleServerEntry(): Promise<void> };
type BuildStep = {
	buildPreparedExport(
		baseUrl: string,
		force: boolean,
		dependencies: {
			router: RouteRegistry;
			routeRendererFactory: StaticGenerationRendererResolver;
			importServerModule: () => Promise<unknown>;
		},
		keepGoing: boolean | undefined,
	): Promise<void>;
};

function createBuilder(): ServerStaticBuilder {
	const appConfig = { rootDir: '/app', integrations: [] } as unknown as EcoPagesAppConfig;
	const staticSiteGenerator = {
		run: vi.fn(async () => {
			events.push('generate');
		}),
	} as unknown as StaticSiteGenerator;
	const builder = new ServerStaticBuilder({
		appConfig,
		runtime: {} as never,
		staticSiteGenerator,
		serveOptions: {},
		logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
	});
	vi.spyOn(builder as unknown as BundleStep, 'bundleServerEntry').mockImplementation(async () => {
		events.push('bundle');
	});
	return builder;
}

async function build(builder: ServerStaticBuilder, page: unknown): Promise<void> {
	const router = {
		templateRoutes: [{ pathname: '/page', kind: 'exact', role: 'page', filePath: 'src/pages/page.tsx' }],
	} as unknown as RouteRegistry;
	const routeRendererFactory = {
		getPageRenderer: () => ({
			loadPageModule: async () => {
				events.push('load');
				return { default: page };
			},
		}),
	} as unknown as StaticGenerationRendererResolver;
	await (builder as unknown as BuildStep).buildPreparedExport(
		'http://localhost:3000',
		false,
		{ router, routeRendererFactory, importServerModule: vi.fn() },
		false,
	);
}

afterEach(() => {
	events.length = 0;
});

describe('ServerStaticBuilder with a Page that needs a server', () => {
	it('loads the Pages once the server output is written, then bundles the server and writes it again', async () => {
		await build(
			createBuilder(),
			Object.assign(() => '', { cache: 'dynamic' }),
		);

		expect(events).toEqual(['emit', 'files', 'load', 'bundle', 'emit', 'files', 'generate']);
	});

	it('leaves a static build alone: no bundle and no second write', async () => {
		await build(
			createBuilder(),
			Object.assign(() => '', { cache: 'static' }),
		);

		expect(events).toEqual(['emit', 'files', 'load', 'generate']);
	});
});
