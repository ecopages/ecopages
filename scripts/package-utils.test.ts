import assert from 'node:assert/strict';
import { test } from 'vitest';
import { rewriteWorkspaceRanges } from './package-utils.ts';

test('rewriteWorkspaceRanges replaces workspace protocol ranges only', () => {
	assert.deepEqual(
		rewriteWorkspaceRanges(
			{
				'@ecopages/core': 'workspace:*',
				'@ecopages/logger': '^0.2.3',
			},
			'1.2.3',
		),
		{
			'@ecopages/core': '1.2.3',
			'@ecopages/logger': '^0.2.3',
		},
	);
});
