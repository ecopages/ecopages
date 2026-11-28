import { describe, expect, test } from 'vitest';
import { refuseWithoutToken, revalidateAction, revalidateSchema, type RevalidationCache } from './revalidate.server.ts';

function recordingCache(): RevalidationCache & { tags: string[][]; paths: string[][] } {
	const tags: string[][] = [];
	const paths: string[][] = [];
	return {
		tags,
		paths,
		invalidateByTags: async (value) => {
			tags.push(value);
		},
		invalidateByPaths: async (value) => {
			paths.push(value);
		},
	};
}

function request(token?: string): Request {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (token) headers.set('authorization', `Bearer ${token}`);
	return new Request('http://localhost/api/revalidate', { method: 'POST', headers });
}

const token = 'a-revalidation-token';

describe('revalidateAction', () => {
	test('invalidates the tags and paths in the body', async () => {
		const cache = recordingCache();

		const response = await revalidateAction(
			revalidateSchema.parse({ tags: ['products'], paths: ['/products/x'] }),
			{ cache },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ revalidated: true });
		expect(cache.tags).toEqual([['products']]);
		expect(cache.paths).toEqual([['/products/x']]);
	});

	test('reports nothing revalidated when the page cache is off', async () => {
		const response = await revalidateAction(revalidateSchema.parse({ tags: ['products'] }), { cache: null });

		expect(await response.json()).toEqual({ revalidated: false });
	});
});

describe('revalidateSchema', () => {
	test('takes empty lists for a field that is left out', () => {
		expect(revalidateSchema.parse({})).toEqual({ tags: [], paths: [] });
		expect(revalidateSchema.parse({ tags: ['a'] })).toEqual({ tags: ['a'], paths: [] });
	});

	test.each([
		['a string for tags', { tags: 'products' }],
		['a number in paths', { paths: [1] }],
		['an array body', []],
		['no body', undefined],
	])('rejects %s', (_, body) => {
		expect(revalidateSchema.safeParse(body).success).toBe(false);
	});
});

describe('refuseWithoutToken', () => {
	test('lets a request with the token go on', () => {
		expect(refuseWithoutToken(request(token), token)).toBeNull();
	});

	test.each([
		['a wrong token', 'wrong'],
		['no Authorization header', undefined],
	])('answers 401 for a request with %s', (_, sent) => {
		expect(refuseWithoutToken(request(sent), token)?.status).toBe(401);
	});

	test('answers 404 when no token is configured, even for a request that sends one', () => {
		expect(refuseWithoutToken(request(token), undefined)?.status).toBe(404);
	});
});
