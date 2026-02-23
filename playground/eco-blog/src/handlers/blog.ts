import { HttpError } from '@ecopages/core/errors';
import { defineApiHandler } from '@ecopages/core/bun';
import { dbService } from '@/lib/db';
import { z } from 'zod';

export const list = defineApiHandler({
	path: '/',
	method: 'GET',
	handler: async (ctx) => {
		const { default: BlogList } = await import('@/views/blog-list.kita');
		const posts = await dbService.getAllPosts();
		return ctx.render(BlogList, { posts });
	},
});

export const detail = defineApiHandler({
	path: '/posts/:slug',
	method: 'GET',
	schema: {
		params: z.object({
			slug: z.string(),
		}),
	},
	handler: async (ctx) => {
		const { default: BlogDetail } = await import('@/views/blog-detail.kita');
		const post = await dbService.getPostBySlug(ctx.params.slug);
		if (!post) throw HttpError.NotFound('Post not found');
		return ctx.render(BlogDetail, { post });
	},
});
