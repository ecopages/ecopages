import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collectInternalWorkspaceRangeMismatches } from './check-release-versions.ts';

test('collectInternalWorkspaceRangeMismatches flags non-workspace ranges for same-repo packages', () => {
	const mismatches = collectInternalWorkspaceRangeMismatches([
		{
			name: '@ecopages/core',
		},
		{
			name: '@ecopages/file-system',
		},
		{
			name: '@ecopages/react',
			peerDependencies: {
				'@ecopages/core': '0.2.0-alpha.34',
			},
			dependencies: {
				'@ecopages/file-system': 'workspace:*',
				'@ecopages/logger': '^0.2.3',
			},
		},
	]);

	assert.deepEqual(mismatches, [
		{
			packageName: '@ecopages/react',
			dependencyName: '@ecopages/core',
			field: 'peerDependencies',
			actual: '0.2.0-alpha.34',
		},
	]);
});

test('collectInternalWorkspaceRangeMismatches ignores external packages and workspace ranges', () => {
	const mismatches = collectInternalWorkspaceRangeMismatches([
		{
			name: '@ecopages/core',
		},
		{
			name: '@ecopages/react',
			peerDependencies: {
				'@ecopages/core': 'workspace:*',
			},
			dependencies: {
				'@ecopages/logger': '^0.2.3',
			},
		},
	]);

	assert.deepEqual(mismatches, []);
});
