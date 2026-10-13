import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
});

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	vi.stubEnv('NODE_ENV', 'production');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	vi.stubEnv('NODE_ENV', 'development');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates, sorts, and groups route instances by renderer', async () => {
	const calls: Array<{
		routeFile: string;
		params?: Record<string, string | string[]>;
		groupedBuildPlan?: { planKey: string };
	}> = [];
	const groupedBuildPlan = { integrationName: 'react', planKey: 'plan', instances: [] };
	const renderer = {
		buildGroupedGraphBuildPlan: async () => groupedBuildPlan,
		prebuildProductionPageBrowserGraph: async (
			filePath: string,
			options?: {
				params?: Record<string, string | string[]>;
				groupedBuildPlan?: { planKey: string };
			},
		) => {
			calls.push({
				routeFile: filePath,
				params: options?.params,
				groupedBuildPlan: options?.groupedBuildPlan,
			});
		},
	};
	const routeRendererFactory = {
		getPageRenderer: () => renderer as never,
	};

	await prebuildProductionPageBrowserGraphs(
		[
			{ routeFile: '/tmp/b/page.tsx', params: { slug: 'beta' } },
			{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } },
			{ routeFile: '/tmp/a/page.tsx', params: { slug: 'alpha' } },
		],
		routeRendererFactory,
	);

	assert.deepEqual(calls, [
		{
			routeFile: '/tmp/a/page.tsx',
			params: { slug: 'alpha' },
			groupedBuildPlan,
		},
		{
			routeFile: '/tmp/b/page.tsx',
			params: { slug: 'beta' },
			groupedBuildPlan,
		},
	]);
});

test('clearProductionPageBrowserGraphSession clears production session records', () => {
	const appConfig = { runtime: {} } as EcoPagesAppConfig;
	const session = getAppPageBrowserGraphSession(appConfig);
	const clearSpy = vi.spyOn(session, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
});
