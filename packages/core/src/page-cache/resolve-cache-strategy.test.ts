import { describe, expect, it, vi } from 'vitest';
import { resolveCacheStrategy } from './resolve-cache-strategy.ts';

const context = { props: { slug: 'chair-1' }, params: { slug: 'chair-1' }, query: { tab: 'specs' } };
const source = '/app/pages/products/[slug].tsx';

describe('resolveCacheStrategy', () => {
	it('calls a cache function with the props, Params and Query of the render', () => {
		const cache = vi.fn(({ params }) => ({ revalidate: 60, tags: [`product:${params.slug}`] }));

		expect(resolveCacheStrategy(cache, context, source)).toEqual({ revalidate: 60, tags: ['product:chair-1'] });
		expect(cache).toHaveBeenCalledWith(context);
	});

	it('lets an error the function throws fail the render', () => {
		const cache = () => {
			throw new Error('no product');
		};

		expect(() => resolveCacheStrategy(cache, context, source)).toThrow('no product');
	});

	it('names the Page when the function returns dynamic', () => {
		const cache = (() => 'dynamic') as never;

		expect(() => resolveCacheStrategy(cache, context, source)).toThrow(
			`The cache function of ${source} returned 'dynamic'`,
		);
	});

	it.each([['static' as const], ['dynamic' as const], [{ revalidate: 60, tags: ['static'] }], [undefined]])(
		'returns a declared value as is: %j',
		(declared) => {
			expect(resolveCacheStrategy(declared, context, source)).toBe(declared);
		},
	);
});
