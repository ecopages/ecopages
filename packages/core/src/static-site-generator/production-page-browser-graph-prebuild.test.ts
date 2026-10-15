import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
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
		buildGroupedGraphBuildPlan: vi.fn(async () => groupedBuildPlan),
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
	assert.deepEqual(reactRenderer.buildGroupedGraphBuildPlan.mock.calls[0], [
		[{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } }],
	]);
	assert.deepEqual(litRenderer.buildGroupedGraphBuildPlan.mock.calls[0], [
		[{ routeFile: '/tmp/b/page.tsx', params: { slug: 'beta' } }],
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

test('clearProductionPageBrowserGraphSession clears production session records', async () => {
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/tmp' });
	const session = getAppPageBrowserGraphSession(appConfig);
	const clearSpy = vi.spyOn(session, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
});
