import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph-session.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
	process.env.NODE_ENV = 'production';
});

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	process.env.NODE_ENV = 'production';
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	process.env.NODE_ENV = 'development';
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates and sorts route files', async () => {
	const calls: string[] = [];
	const routeRendererFactory = {
		getPageRenderer: () =>
			({
				prebuildProductionPageBrowserGraph: async (filePath: string) => {
					calls.push(filePath);
				},
			}) as never,
	};

	await prebuildProductionPageBrowserGraphs(
		['/tmp/b/page.tsx', '/tmp/a/page.tsx', '/tmp/a/page.tsx'],
		routeRendererFactory,
	);

	assert.deepEqual(calls, ['/tmp/a/page.tsx', '/tmp/b/page.tsx']);
});

test('clearProductionPageBrowserGraphSession clears production session records', () => {
	const appConfig = { runtime: {} } as EcoPagesAppConfig;
	const session = getAppPageBrowserGraphSession(appConfig);
	const clearSpy = vi.spyOn(session, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
});
