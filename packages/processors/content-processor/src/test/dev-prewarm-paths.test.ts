import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildContentDevPrewarmPathnames, resolveContentDevPrewarmSlugs } from '../dev-prewarm-paths.ts';

test('resolveContentDevPrewarmSlugs supports first, all, slugs, and limit', () => {
	const entries = [
		{ slug: 'a/one', segments: ['a', 'one'] },
		{ slug: 'b/two', segments: ['b', 'two'] },
	];

	assert.deepEqual(resolveContentDevPrewarmSlugs('first', entries), ['a/one']);
	assert.deepEqual(resolveContentDevPrewarmSlugs('all', entries), ['a/one', 'b/two']);
	assert.deepEqual(resolveContentDevPrewarmSlugs({ slugs: ['b/two'] }, entries), ['b/two']);
	assert.deepEqual(resolveContentDevPrewarmSlugs({ limit: 1 }, entries), ['a/one']);
});

test('buildContentDevPrewarmPathnames joins routePrefix and slugs', () => {
	const paths = buildContentDevPrewarmPathnames(
		{ routePrefix: '/docs', devPrewarm: { slugs: ['getting-started/introduction'] } },
		[{ slug: 'getting-started/introduction', segments: ['getting-started', 'introduction'] }],
	);

	assert.deepEqual(paths, ['/docs/getting-started/introduction']);
});
