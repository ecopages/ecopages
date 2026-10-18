import { describe, expect, it } from 'vitest';
import { toEcopagesRouteInfo } from './ecopages-route-info.ts';

describe('toEcopagesRouteInfo', () => {
	it('preserves catch-all path segments in the shared params shape', () => {
		expect(toEcopagesRouteInfo({ pathname: '/docs/a/b', params: { slug: ['a', 'b'] } })).toEqual({
			pathname: '/docs/a/b',
			params: { slug: ['a', 'b'] },
		});
	});
});
