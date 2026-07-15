import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ConfigBuilder } from '../config/config-builder.ts';
import { prepareHmrFileChange } from '../hmr/hmr-file-change-prep.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph-session.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const benchDir = path.join(repoRoot, 'playground', 'kitchen-sink', 'bench');

describe('kitchen-sink graph lifecycle regression contract', () => {
	test('exposes startup baseline comparison tooling', () => {
		expect(existsSync(path.join(benchDir, 'startup', 'compare-baseline.ts'))).toBe(true);
		expect(existsSync(path.join(benchDir, 'startup', 'run.mjs'))).toBe(true);
	});

	test('invalidates cached graphs before HMR dispatch for tracked dependencies', async () => {
		const appConfig = await new ConfigBuilder()
			.setRootDir(path.join(repoRoot, 'playground', 'kitchen-sink'))
			.build();
		const session = getAppPageBrowserGraphSession(appConfig);
		const routeFile = path.join(appConfig.absolutePaths.pagesDir, 'index.kita.tsx');

		await session.resolveGraph(
			{
				integrationName: 'kita',
				routeFile,
				entryFingerprint: 'index',
				policy: 'development',
			},
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set([routeFile]),
			}),
		);

		const preparation = prepareHmrFileChange(appConfig, routeFile);
		expect(preparation.invalidatedGraphCount).toBeGreaterThan(0);
		expect(preparation.affectedGraphIdentities.some((identity) => identity.routeFile === routeFile)).toBe(true);
	});
});
