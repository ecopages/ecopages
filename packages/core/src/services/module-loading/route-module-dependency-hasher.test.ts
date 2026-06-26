import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import {
	RouteModuleDependencyHasher,
	filterTrackableRouteModuleDependencies,
	isTrackableRouteModuleDependency,
	resolveRouteModuleDependencyPaths,
} from './route-module-dependency-hasher.ts';

describe('RouteModuleDependencyHasher', () => {
	it('excludes node builtins and node_modules paths from tracking', () => {
		assert.equal(isTrackableRouteModuleDependency('node:fs'), false);
		assert.equal(isTrackableRouteModuleDependency('/app/node_modules/react/index.js'), false);
		assert.equal(isTrackableRouteModuleDependency('/app/src/layouts/shared.tsx'), true);
	});

	it('memoizes dependency hashes within one build run', () => {
		let hashCalls = 0;
		const hasher = new RouteModuleDependencyHasher({
			exists: () => true,
			hashFile: (filePath) => {
				hashCalls += 1;
				return `hash:${path.basename(filePath)}`;
			},
		});

		const modulePaths = ['/app/pages/about.tsx', '/app/layouts/shared.tsx'];
		hasher.createDependencyHashes(modulePaths);
		hasher.createDependencyHashes(['/app/pages/contact.tsx', '/app/layouts/shared.tsx']);

		assert.equal(hashCalls, 3);
	});

	it('invalidates cache entries when a tracked dependency hash changes', () => {
		const hashes = new Map<string, string>([
			['/app/pages/about.tsx', 'hash-a'],
			['/app/layouts/shared.tsx', 'hash-layout'],
		]);
		const hasher = new RouteModuleDependencyHasher({
			exists: (filePath) => hashes.has(filePath),
			hashFile: (filePath) => hashes.get(filePath) ?? 'missing',
		});

		const storedHashes = hasher.createDependencyHashes([
			'/app/pages/about.tsx',
			'/app/layouts/shared.tsx',
			'node:fs',
			'/app/node_modules/react/index.js',
		]);
		assert.deepEqual(
			filterTrackableRouteModuleDependencies(['/app/pages/about.tsx', '/app/layouts/shared.tsx', 'node:fs']),
			['/app/layouts/shared.tsx', '/app/pages/about.tsx'],
		);
		assert.equal(hasher.matchesStoredHashes(storedHashes), true);

		hashes.set('/app/layouts/shared.tsx', 'hash-layout-v2');
		hasher.clearMemoForTests();
		assert.equal(hasher.matchesStoredHashes(storedHashes, '/app/pages/about.tsx', 'hash-a'), false);
	});

	it('resolves dependency paths from build results', () => {
		const dependencyPaths = resolveRouteModuleDependencyPaths(
			{
				dependencyGraph: {
					entrypoints: {
						'/app/pages/about.tsx': ['/app/pages/about.tsx', '/app/layouts/shared.tsx', 'node:fs'],
					},
				},
			},
			'/app/pages/about.tsx',
			'/app',
		);

		assert.deepEqual(dependencyPaths, ['/app/pages/about.tsx', '/app/layouts/shared.tsx', '/app/node:fs']);
	});
});
