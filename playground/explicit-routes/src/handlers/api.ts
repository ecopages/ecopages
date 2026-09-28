import { defineApiHandler } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { posts } from '../data';
import z from 'zod';

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
	handler: async ({ params, response }) => {
		const post = posts.find((p) => p.slug === params.slug);
		if (!post) {
			throw HttpError.NotFound('Post not found');
		}
		return response.json(post);
	},
	schema: {
		params: z.object({
			slug: z.string(),
		}),
	},
});
