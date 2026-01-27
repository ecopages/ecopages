import { eco } from '@ecopages/core';
import { AdminLayout } from '@/layouts/admin-layout.kita';
import type { Post } from '@/lib/db';

export interface AdminPostListProps {
	posts: Post[];
}

const AdminPostList = eco.page<AdminPostListProps>({
	layout: AdminLayout,
	metadata: () => ({
		title: 'Posts | Admin',
		description: 'Manage your blog posts',
	}),
	render: ({ posts }) => {
		return (
			<div class="space-y-8">
				<header class="flex justify-between items-center">
					<h1 class="text-2xl font-bold text-slate-900">Manage Posts</h1>
					<a
						href="/admin/new"
						class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all active:scale-95"
					>
						Create New Post
					</a>
				</header>

				<div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
					<table class="w-full text-left">
						<thead>
							<tr class="bg-slate-50 border-b border-slate-200">
								<th class="px-6 py-4 text-sm font-semibold text-slate-600">Post</th>
								<th class="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
								<th class="px-6 py-4 text-sm font-semibold text-slate-600">Date</th>
								<th class="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{posts.length === 0 ? (
								<tr>
									<td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">
										No posts found. Get started by creating your first post.
									</td>
								</tr>
							) : (
								posts.map((post) => (
									<tr class="hover:bg-slate-50 transition-colors">
										<td class="px-6 py-4">
											<div class="font-medium text-slate-900">{post.title}</div>
											<div class="text-xs text-slate-400 mt-1">/posts/{post.slug}</div>
										</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
												Published
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-slate-500">
											{new Date(post.published_at!).toLocaleDateString()}
										</td>
										<td class="px-6 py-4 text-right space-x-3">
											<a
												href={`/admin/posts/${post.id}`}
												class="text-sm font-medium text-indigo-600 hover:text-indigo-900"
											>
												Edit
											</a>
											<form
												action={`/admin/posts/${post.id}/delete`}
												method="POST"
												class="inline"
											>
												<button
													type="submit"
													class="text-sm font-medium text-rose-600 hover:text-rose-900"
													onclick="return confirm('Are you sure you want to delete this post?')"
												>
													Delete
												</button>
											</form>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		);
	},
});

export default AdminPostList;
