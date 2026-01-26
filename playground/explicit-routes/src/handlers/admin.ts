import { HttpError } from '@ecopages/core/errors';
import { z } from 'zod';
import { type Post, posts } from '../data';
import type { ApiHandlerContext } from '@ecopages/core';

export const createPostSchema = z.object({
	slug: z
		.string()
		.min(3)
		.regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
	title: z.string().min(5),
	content: z.string().min(10),
});

export async function createPost(ctx: ApiHandlerContext) {
	const { title, content, slug } = ctx.body as z.infer<typeof createPostSchema>;

	if (posts.find((p) => p.slug === slug)) {
		throw HttpError.Conflict('Post with this slug already exists');
	}

	const newPost: Post = { title, content, slug };
	posts.push(newPost);

	return ctx.json(newPost, { status: 201 });
}
