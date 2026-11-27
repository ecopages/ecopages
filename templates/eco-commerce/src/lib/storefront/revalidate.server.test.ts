import { describe, expect, test } from 'vitest';
import { revalidateAction, type RevalidationCache } from './revalidate.server.ts';

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

function request(body: unknown, token?: string): Request {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (token) headers.set('authorization', `Bearer ${token}`);
	return new Request('http://localhost/api/revalidate', { method: 'POST', headers, body: JSON.stringify(body) });
}

const token = 'a-revalidation-token';

describe('revalidateAction', () => {
	test('invalidates the tags and paths in the body', async () => {
		const cache = recordingCache();

		const response = await revalidateAction(request({ tags: ['products'], paths: ['/products/x'] }, token), {
			token,
			cache,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ revalidated: true });
		expect(cache.tags).toEqual([['products']]);
		expect(cache.paths).toEqual([['/products/x']]);
	});

	test.each([
		['a wrong token', 'wrong'],
		['no Authorization header', undefined],
	])('refuses a request with %s', async (_, sent) => {
		const cache = recordingCache();

		const response = await revalidateAction(request({ tags: ['products'] }, sent), { token, cache });

		expect(response.status).toBe(401);
		expect(cache.tags).toEqual([]);
	});

	test('is disabled when no token is configured', async () => {
		const response = await revalidateAction(request({ tags: ['products'] }, token), {
			token: undefined,
			cache: recordingCache(),
		});

		expect(response.status).toBe(404);
	});

	test('rejects a body that is not lists of strings', async () => {
		const response = await revalidateAction(request({ tags: 'products' }, token), {
			token,
			cache: recordingCache(),
		});

		expect(response.status).toBe(400);
	});

	test('reports nothing revalidated when the page cache is off', async () => {
		const response = await revalidateAction(request({ tags: ['products'] }, token), { token, cache: null });

		expect(await response.json()).toEqual({ revalidated: false });
	});
});
