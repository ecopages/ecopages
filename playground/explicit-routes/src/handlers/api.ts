import { HttpError } from '@ecopages/core/errors';
import { posts } from '../data';
import type { ApiHandlerContext } from '@ecopages/core';

export async function list(ctx: ApiHandlerContext) {
	return ctx.json(posts);
}

export async function detail(ctx: ApiHandlerContext) {
	const slug = (ctx.request as any).params.slug;
	const post = posts.find((p) => p.slug === slug);
	if (!post) {
		throw HttpError.NotFound('Post not found');
	}
	return ctx.json(post);
}
