import { describe, expect, test } from 'vitest';
import {
	createPageDependencyInstanceKey,
	createRouteGraphLookupKey,
	serializeGroupedGraphCacheKey,
} from './route-instance-key.ts';

describe('page dependency instance key', () => {
	test('returns an empty key for routes without dependency inputs', () => {
		expect(createPageDependencyInstanceKey({ params: {} })).toBe('');
		expect(createPageDependencyInstanceKey({})).toBe('');
	});

	test('canonically serializes params and query inputs', () => {
		expect(
			createPageDependencyInstanceKey({
				params: { slug: ['docs', 'intro'] },
				query: { mode: 'preview' },
			}),
		).toBe(JSON.stringify({ params: [['slug', ['docs', 'intro']]], query: [['mode', 'preview']] }));
	});

	test('keeps scalar and array values and delimiter-laden inputs distinct', () => {
		const scalar = createPageDependencyInstanceKey({ params: { slug: 'a/b' } });
		const segments = createPageDependencyInstanceKey({ params: { slug: ['a', 'b'] } });
		const delimited = createPageDependencyInstanceKey({ params: { slug: 'a&b=c' } });
		const split = createPageDependencyInstanceKey({ params: { slug: ['a', 'b=c'] } });

		expect(new Set([scalar, segments, delimited, split]).size).toBe(4);
	});

	test('createRouteGraphLookupKey scopes grouped graph maps', () => {
		expect(createRouteGraphLookupKey('/app/pages/docs/[...slug]/index.tsx')).toBe(
			JSON.stringify(['/app/pages/docs/[...slug]/index.tsx', '']),
		);
		expect(createRouteGraphLookupKey('/app/pages/docs/[...slug]/index.tsx', '{"params":[]}')).toBe(
			JSON.stringify(['/app/pages/docs/[...slug]/index.tsx', '{"params":[]}']),
		);
	});

	test('serializeGroupedGraphCacheKey scopes grouped graph caches by integration and plan', () => {
		expect(
			serializeGroupedGraphCacheKey({
				integrationName: 'react',
				planKey: 'plan-a',
			}),
		).toBe(JSON.stringify(['grouped', 'react', 'plan-a']));
	});
});
