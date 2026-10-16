import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { requireAppRuntime } from '../config/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';

const { buildAppBrowserClientMock } = vi.hoisted(() => ({ buildAppBrowserClientMock: vi.fn() }));

vi.mock('../services/assets/app-browser-client-build.ts', () => ({
	buildAppBrowserClient: buildAppBrowserClientMock,
}));

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
	buildAppBrowserClientMock.mockReset();
});

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	vi.stubEnv('NODE_ENV', 'production');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	vi.stubEnv('NODE_ENV', 'development');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates, sorts, and groups route instances by renderer', async () => {
	const calls: Array<{
		rendererName: string;
		routeFile: string;
		params?: Record<string, string | string[]>;
		groupedBuildPlan?: { planKey: string };
	}> = [];
	const reactGroupedBuildPlan = { integrationName: 'react', planKey: 'react-plan', instances: [] };
	const litGroupedBuildPlan = { integrationName: 'lit', planKey: 'lit-plan', instances: [] };
	const reactAppBrowserPlan = { ...reactGroupedBuildPlan, planKey: 'react-app-browser-client' };
	const litAppBrowserPlan = { ...litGroupedBuildPlan, planKey: 'lit-app-browser-client' };
	buildAppBrowserClientMock.mockResolvedValue([reactAppBrowserPlan, litAppBrowserPlan]);
	const createRenderer = (rendererName: string, groupedBuildPlan: { planKey: string }) => ({
		buildGroupedGraphBuildPlan: vi.fn(async (_instances: unknown[], _options: unknown) => groupedBuildPlan),
		prebuildProductionPageBrowserGraph: async (
			filePath: string,
			options?: {
				params?: Record<string, string | string[]>;
				groupedBuildPlan?: { planKey: string };
			},
		) => {
			calls.push({
				rendererName,
				routeFile: filePath,
				params: options?.params,
				groupedBuildPlan: options?.groupedBuildPlan,
			});
		},
	});
	const reactRenderer = createRenderer('react', reactGroupedBuildPlan);
	const litRenderer = createRenderer('lit', litGroupedBuildPlan);
	const appConfig = {
		rootDir: '/tmp',
		absolutePaths: { pagesDir: '/tmp/pages', srcDir: '/tmp/src', distDir: '/tmp/dist', workDir: '/tmp/.eco' },
		integrations: [],
	} as unknown as EcoPagesAppConfig;
	const routeRendererFactory = {
		getPageRenderer: (routeFile: string) => (routeFile.includes('/a/') ? reactRenderer : litRenderer) as never,
	};

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile: '/tmp/b/page.tsx', params: { slug: 'beta' } },
			{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } },
			{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } },
		],
		routeRendererFactory,
	);

	assert.equal(buildAppBrowserClientMock.mock.calls.length, 1);
	assert.deepEqual(buildAppBrowserClientMock.mock.calls[0], [
		appConfig,
		[reactGroupedBuildPlan, litGroupedBuildPlan],
	]);
	assert.deepEqual(reactRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } },
	]);
	assert.deepEqual(litRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: '/tmp/b/page.tsx', params: { slug: 'beta' } },
	]);
	assert.deepEqual(calls, [
		{
			rendererName: 'react',
			routeFile: '/tmp/a/page.tsx',
			params: { slug: 'alpha' },
			groupedBuildPlan: reactAppBrowserPlan,
		},
		{
			rendererName: 'lit',
			routeFile: '/tmp/b/page.tsx',
			params: { slug: 'beta' },
			groupedBuildPlan: litAppBrowserPlan,
		},
	]);
});

test('prebuildProductionPageBrowserGraphs skips routes whose preparation failed', async () => {
	const routeFile = '/tmp/pages/[slug].tsx';
	const failure = new Error('broken static props');
	const successfulInstance = {
		routeFile,
		dependencyInstanceKey: '["healthy"]',
		contribution: { assets: [] },
		pageClientBuildEntries: [],
		prebuiltPageClientBrowserAssets: {
			processedAssets: [],
			islandRenderAssetsByFile: new Map(),
			fallbackDependencies: [],
		},
	};
	const groupedBuildPlan = {
		integrationName: 'react',
		planKey: 'react-plan',
		instances: [successfulInstance],
	};
	buildAppBrowserClientMock.mockResolvedValue([{ ...groupedBuildPlan, planKey: 'app-browser-plan' }]);
	const prebuiltRoutes: string[] = [];
	const renderer = {
		buildGroupedGraphBuildPlan: vi.fn(
			async (
				instances: Array<{ routeFile: string; params?: Record<string, string | string[]> }>,
				options?: {
					onRouteFailure?: (
						routeInstance: { routeFile: string; params?: Record<string, string | string[]> },
						error: unknown,
					) => void;
				},
			) => {
				const failedInstance = instances.find(({ params }) => params?.slug === 'broken');
				if (!failedInstance) throw new Error('Expected the failing route instance');
				options?.onRouteFailure?.(failedInstance, failure);
				return groupedBuildPlan;
			},
		),
		prebuildProductionPageBrowserGraph: vi.fn(async (routePath: string) => {
			prebuiltRoutes.push(routePath);
		}),
	};
	const appConfig = {
		rootDir: '/tmp',
		absolutePaths: { pagesDir: '/tmp/pages', srcDir: '/tmp/src', distDir: '/tmp/dist', workDir: '/tmp/.eco' },
		integrations: [],
	} as unknown as EcoPagesAppConfig;
	const routeRendererFactory = {
		getPageRenderer: () => renderer as never,
	};

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile, params: { slug: 'broken' } },
			{ routeFile, params: { slug: 'healthy' } },
		],
		routeRendererFactory,
	);

	assert.deepEqual(prebuiltRoutes, [routeFile]);
	assert.deepEqual(buildAppBrowserClientMock.mock.calls[0]?.[1], [groupedBuildPlan]);
});

test('clearProductionPageBrowserGraphSession clears production session records', async () => {
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/tmp' });
	const session = requireAppRuntime(appConfig).pageBrowserGraphSession;
	const clearSpy = vi.spyOn(session, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
});
