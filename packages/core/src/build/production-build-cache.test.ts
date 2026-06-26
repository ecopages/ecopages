import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
	getProductionBuildCacheManifestPaths,
	isProductionCacheManifestCurrent,
	matchesProductionCacheBuildKey,
	matchesProductionCacheFingerprint,
} from './production-build-cache.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

describe('production-build-cache', () => {
	test('shared manifest helpers invalidate consistently across cache kinds', () => {
		const manifest = {
			invalidationVersion: '1.0.0',
			buildInputsFingerprint: 'inputs-v1',
			buildKey: 'node::esm::plugin-a',
			builtAt: Date.now(),
		};

		assert.equal(isProductionCacheManifestCurrent(manifest, '1.0.0'), true);
		assert.equal(isProductionCacheManifestCurrent(manifest, '2.0.0'), false);
		assert.equal(matchesProductionCacheFingerprint(manifest, 'inputs-v1'), true);
		assert.equal(matchesProductionCacheFingerprint(manifest, 'inputs-v2'), false);
		assert.equal(matchesProductionCacheBuildKey(manifest, 'node::esm::plugin-a'), true);
		assert.equal(matchesProductionCacheBuildKey(manifest, 'node::esm::plugin-b'), false);
	});

	test('registry lists every persisted production cache manifest path', () => {
		const appConfig = {
			rootDir: '/tmp/app',
			absolutePaths: { executionDir: '/tmp/app/.eco' },
		} as EcoPagesAppConfig;

		const paths = getProductionBuildCacheManifestPaths(appConfig);
		assert.equal(paths.length, 4);
		assert.ok(paths.some((manifestPath) => manifestPath.includes('.server-modules')));
		assert.ok(paths.some((manifestPath) => manifestPath.includes('.server-entry')));
		assert.ok(paths.some((manifestPath) => manifestPath.includes('.server-pages-graph')));
	});

	test('processor plugin fingerprint change invalidates all cache kinds uniformly', () => {
		const before = {
			invalidationVersion: '1.0.0',
			buildInputsFingerprint: 'inputs-before',
			buildKey: 'node::esm::plugin-a',
		};
		const afterFingerprint = 'inputs-after';

		for (const kind of ['server-entry', 'route-module', 'pages-graph'] as const) {
			assert.equal(
				matchesProductionCacheFingerprint(before, afterFingerprint),
				false,
				`${kind} should miss after fingerprint change`,
			);
		}
	});
});
