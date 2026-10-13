import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { prepareHmrFileChange } from '../hmr/hmr-file-change-prep.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('kitchen-sink graph lifecycle regression contract', () => {
	test('invalidates cached graphs before HMR dispatch for tracked dependencies', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: path.join(repoRoot, 'playground', 'kitchen-sink') });
		const session = getAppPageBrowserGraphSession(appConfig);
		const routeFile = path.join(appConfig.absolutePaths.pagesDir, 'index.kita.tsx');

		await session.resolveGraph(
			{
				integrationName: 'kita',
				routeFile,
				dependencyInstanceKey: '',
				entryFingerprint: 'index',
				policy: 'development',
			},
			new Set([routeFile]),
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set([routeFile]),
			}),
		);

		const preparation = prepareHmrFileChange(appConfig, routeFile);
		expect(preparation.affectedGraphIdentities.some((identity) => identity.routeFile === routeFile)).toBe(true);
		expect(session.getAffectedGraphIdentities(routeFile)).toEqual([]);
	});
});
