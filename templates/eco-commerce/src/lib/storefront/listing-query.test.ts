import { describe, expect, test } from 'vitest';
import { listingUrl, parseListingQuery, toProductQuery } from './listing-query.ts';

describe('listing query', () => {
	test('reads the search page URL query into filters', () => {
		const filters = parseListingQuery({
			q: ' oak chair ',
			in: 'lounge-chairs',
			material: ['oak', 'ash'],
			finish: 'natural',
			min: '50',
			max: '300',
			sort: 'price-asc',
			page: '2',
		});

		expect(filters).toEqual({
			q: 'oak chair',
			in: 'lounge-chairs',
			material: ['oak', 'ash'],
			finish: ['natural'],
			min: 50,
			max: 300,
			sort: 'price-asc',
			page: 2,
		});
	});

	test('drops values it does not understand instead of failing', () => {
		expect(parseListingQuery({ min: 'cheap', max: '-5', sort: 'random', page: '0', material: '' })).toEqual({
			q: '',
			material: [],
			finish: [],
			sort: 'featured',
			page: 1,
		});
	});

	test('turns filters into a backend query, prices in cents', () => {
		expect(toProductQuery(parseListingQuery({ q: 'lamp', min: '10', max: '20', page: '3' }))).toEqual({
			search: 'lamp',
			subcategory: undefined,
			materials: [],
			finishes: [],
			minPrice: 1000,
			maxPrice: 2000,
			sort: 'featured',
			page: 3,
		});
	});

	test('writes filters back as a search page URL, leaving defaults out', () => {
		expect(listingUrl({ q: 'lamp', material: ['oak'], finish: [], sort: 'featured', page: 1 })).toBe(
			'/search?q=lamp&material=oak',
		);
		expect(
			listingUrl({ q: '', in: 'sofas', material: [], finish: ['sand'], max: 400, sort: 'name', page: 2 }),
		).toBe('/search?in=sofas&finish=sand&max=400&sort=name&page=2');
	});

	test('a URL it writes reads back as the same filters', () => {
		const filters = parseListingQuery({ q: 'mug', material: ['cork'], min: '5', sort: 'price-desc' });
		const params = new URL(listingUrl(filters), 'http://store.test').searchParams;
		const query = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));

		expect(parseListingQuery(query)).toEqual(filters);
	});
});
