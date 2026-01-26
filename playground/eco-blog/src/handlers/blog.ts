import { HttpError } from '@ecopages/core/errors';
import type { ApiHandlerContext } from '@ecopages/core';
import { dbService } from '@/lib/db';
import { BlogList } from '@/views/blog-list.kita';
import { BlogDetail } from '@/views/blog-detail.kita';

export async function list(ctx: ApiHandlerContext) {
	const posts = await dbService.getAllPosts();
	return ctx.render(BlogList, { posts });
}

export async function detail(ctx: ApiHandlerContext) {
	const post = await dbService.getPostBySlug((ctx.request as any).params.slug);
	if (!post) throw HttpError.NotFound('Post not found');
	return ctx.render(BlogDetail, { post });
}
