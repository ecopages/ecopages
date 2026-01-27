import { defineApiHandler } from '@ecopages/core/adapters/bun';
import { HttpError } from '@ecopages/core/errors';
import { posts } from '../data';

export const list = defineApiHandler({
	path: '/api/v1/posts',
	method: 'GET',
	handler: async ({ response }) => {
		return response.json(posts);
	},
});

export const detail = defineApiHandler({
	path: '/api/v1/posts/:slug',
	method: 'GET',
	handler: async ({ request, response }) => {
		const post = posts.find((p) => p.slug === request.params.slug);
		if (!post) {
			throw HttpError.NotFound('Post not found');
		}
		return response.json(post);
	},
});
