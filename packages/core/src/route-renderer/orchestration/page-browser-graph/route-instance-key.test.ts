import { describe, expect, test } from 'vitest';
import {
	createRouteGraphLookupKey,
	createRouteInstanceKey,
	parseRouteInstanceKey,
	serializeGroupedGraphCacheKey,
} from './route-instance-key.ts';

describe('route-instance-key', () => {
	test('createRouteInstanceKey returns empty string for static routes', () => {
		expect(createRouteInstanceKey({ params: {} })).toBe('');
		expect(createRouteInstanceKey({})).toBe('');
	});

	test('createRouteInstanceKey serializes catch-all params', () => {
		expect(createRouteInstanceKey({ params: { slug: ['docs', 'intro'] } })).toBe('slug=docs/intro');
	});

	test('parseRouteInstanceKey round-trips serialized params', () => {
		const key = createRouteInstanceKey({ params: { slug: ['docs', 'intro'] } });
		expect(parseRouteInstanceKey(key)).toEqual({ slug: ['docs', 'intro'] });
	});

	test('createRouteGraphLookupKey scopes grouped graph maps', () => {
		expect(createRouteGraphLookupKey('/app/pages/docs/[...slug]/index.tsx')).toBe(
			'/app/pages/docs/[...slug]/index.tsx',
		);
		expect(createRouteGraphLookupKey('/app/pages/docs/[...slug]/index.tsx', 'slug=docs/intro')).toBe(
			'/app/pages/docs/[...slug]/index.tsx::slug=docs/intro',
		);
	});

	test('serializeGroupedGraphCacheKey scopes grouped graph caches by route instance', () => {
		expect(
			serializeGroupedGraphCacheKey({
				integrationName: 'react',
				routeInstanceKey: 'slug=docs/intro',
			}),
		).toBe('grouped::react::slug=docs/intro');
	});
});
