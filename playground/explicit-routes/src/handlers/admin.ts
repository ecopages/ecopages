import { defineGroupHandler } from '@ecopages/core/adapters/bun';
import { HttpError } from '@ecopages/core/errors';
import { z } from 'zod';
import { type Post, posts } from '../data';

export const createPostSchema = z.object({
	slug: z
		.string()
		.min(3)
		.regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
	title: z.string().min(5),
	content: z.string().min(10),
});

export const adminGroup = defineGroupHandler({
	prefix: '/api/v1/admin',
	routes: (define) => [
		define({
			path: '/posts',
			method: 'POST',
			schema: { body: createPostSchema },
			handler: async (ctx) => {
				const { title, content, slug } = ctx.body;

				if (posts.find((p) => p.slug === slug)) {
					throw HttpError.Conflict('Post with this slug already exists');
				}

				const newPost: Post = { title, content, slug };
				posts.push(newPost);

				return ctx.response.status(201).json(newPost);
			},
		}),
	],
});
