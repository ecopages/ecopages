import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { AdminShell } from '@/layouts/admin-shell/admin-shell';
import { formatDate } from '@/lib/format';
import { postsService, type Post } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';
import './admin-posts.css';

export default eco.page<{ posts: Post[] }, JsxRenderable>({
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['session'] as const,
	dependencies: { scripts: ['./admin-posts.script.ts'] },
	staticProps: async () => ({ props: { posts: await postsService.list() } }),
	metadata: () => ({ title: 'Posts | EcoBlog author', description: 'Manage blog posts.' }),
	render: ({ posts, locals }) => (
		<AdminShell current="posts" userName={locals.session.user.name}>
			<div class="admin-posts">
				<header class="admin-posts__header">
					<h1>Posts</h1>
					<RuiButton href="/admin/new" variant="filled">
						New post
					</RuiButton>
				</header>
				{posts.length === 0 ? (
					<p class="admin-posts__empty">No posts yet. Write the first one.</p>
				) : (
					<div class="admin-posts__table">
						<table>
							<thead>
								<tr>
									<th scope="col">Title</th>
									<th scope="col">Published</th>
									<th scope="col">
										<span class="visually-hidden">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{posts.map((post) => (
									<tr>
										<td>
											<a class="admin-posts__title" href={`/posts/${post.slug}`}>
												{post.title}
											</a>
											<span class="admin-posts__slug">/posts/{post.slug}</span>
										</td>
										<td>
											<time datetime={post.published_at.toISOString()}>
												{formatDate(post.published_at)}
											</time>
										</td>
										<td>
											<div class="admin-posts__actions">
												<RuiButton href={`/admin/posts/${post.id}`} variant="ghost" size="sm">
													Edit<span class="visually-hidden"> {post.title}</span>
												</RuiButton>
												<form
													action={`/api/posts/${post.id}/delete`}
													method="post"
													data-confirm={`Delete “${post.title}”?`}
												>
													<RuiButton type="submit" variant="destructive" size="sm">
														Delete<span class="visually-hidden"> {post.title}</span>
													</RuiButton>
												</form>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</AdminShell>
	),
});
