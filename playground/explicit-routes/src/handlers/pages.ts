import { PostView } from '../views/post-view.kita';
import { PostListView } from '../views/post-list-view.kita';
import { posts } from '../data';
import type { ApiHandlerContext } from '@ecopages/core';

export const PostListPage = PostListView;
export const PostDetailPage = PostView;

export async function latest(ctx: ApiHandlerContext) {
	const latestPost = posts[posts.length - 1];
	return ctx.render(PostView, latestPost);
}
