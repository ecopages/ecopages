import { describe, expect, test, afterEach } from 'vitest';
import { prepareHmrFileChange } from './hmr-file-change-prep.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

const appConfig = {
	runtime: {},
} as unknown as EcoPagesAppConfig;

afterEach(() => {
	getAppPageBrowserGraphSession(appConfig).resetForTests();
});

describe('prepareHmrFileChange', () => {
	test('reports affected graph identities and invalidates dependent records', async () => {
		const session = getAppPageBrowserGraphSession(appConfig);
		const sharedLayout = '/app/src/layouts/root.tsx';

		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/index.tsx',
				routeInstanceKey: '',
				entryFingerprint: 'index',
				policy: 'development',
			},
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/index.tsx', sharedLayout]),
			}),
		);

		const preparation = prepareHmrFileChange(appConfig, sharedLayout);

		expect(preparation.affectedGraphIdentities).toEqual([
			{
				integrationName: 'react',
				routeFile: '/app/pages/index.tsx',
				routeInstanceKey: '',
				policy: 'development',
				entryFingerprint: 'index',
			},
		]);
		expect(preparation.invalidatedGraphCount).toBe(1);
	});
});
