import { describe, expect, test, afterEach } from 'vitest';
import {
	clearPagesBrowserGraphManifest,
	commitPagesBrowserGraphManifest,
	readPagesBrowserGraphManifest,
} from './pages-browser-graph-build.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph-session.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

const appConfig = {
	runtime: {},
} as unknown as EcoPagesAppConfig;

afterEach(() => {
	getAppPageBrowserGraphSession(appConfig).resetForTests();
	clearPagesBrowserGraphManifest(appConfig);
});

describe('pages browser graph manifest', () => {
	test('commits production graph records only after a successful transaction', async () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';

		try {
			const session = getAppPageBrowserGraphSession(appConfig);
			await session.resolveGraph(
				{
					integrationName: 'react',
					routeFile: '/app/pages/index.tsx',
					entryFingerprint: 'index',
					policy: 'production',
				},
				async () => ({
					result: {
						entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/index.js' }],
						chunkAssets: [],
					},
					dependencyPaths: new Set(['/app/pages/index.tsx']),
				}),
			);

			commitPagesBrowserGraphManifest(appConfig);
			const manifest = readPagesBrowserGraphManifest(appConfig);

			expect(manifest?.graphs['/app/pages/index.tsx']?.entryAssetPaths).toEqual(['/assets/index.js']);
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
	});
});
