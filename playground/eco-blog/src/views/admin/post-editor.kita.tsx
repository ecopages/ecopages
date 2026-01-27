import { eco } from '@ecopages/core';
import { AdminLayout } from '@/layouts/admin-layout.kita';
import { RadiantEditor } from '@/components/radiant-editor.kita';
import { RadiantInput } from '@/components/radiant-input.kita';
import type { Post } from '@/lib/db';

export interface PostEditorProps {
	post?: Post;
}

const AdminPostEditor = eco.page<PostEditorProps>({
	layout: AdminLayout,
	metadata: ({ props }) => ({
		title: props.post ? `Edit: ${props.post.title}` : 'New Post | Admin',
		description: 'Admin area to write and edit blog posts',
	}),
	dependencies: {
		components: [RadiantEditor, RadiantInput],
		stylesheets: ['./post-editor.css'],
	},
	render: ({ post }) => {
		return (
			<div class="max-w-4xl mx-auto">
				<header class="flex justify-between items-center mb-8">
					<h1 class="text-2xl font-bold text-slate-900">{post ? 'Edit Post' : 'Create New Post'}</h1>
					<div class="flex gap-3">
						<button
							type="button"
							class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							form="post-form"
							class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all active:scale-95"
						>
							{post ? 'Update Post' : 'Publish Post'}
						</button>
					</div>
				</header>

				<form
					id="post-form"
					action={post ? `/admin/posts/${post.id}` : '/admin/posts'}
					method="POST"
					class="space-y-8"
				>
					<div class="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
						<RadiantInput label="Title" name="title" value={post?.title || ''} required />

						<div>
							<label class="block text-sm font-semibold text-slate-700 mb-2">Slug</label>
							<div class="flex">
								<span class="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 text-slate-500 text-sm">
									/posts/
								</span>
								<input
									type="text"
									name="slug"
									value={post?.slug || ''}
									required
									class="flex-1 min-w-0 block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-r-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
									placeholder="kebab-case-slug"
								/>
							</div>
						</div>

						<div>
							<label class="block text-sm font-semibold text-slate-700 mb-2">Content</label>
							<RadiantEditor name="content" content={post?.content || ''} />
						</div>

						<div>
							<label class="block text-sm font-semibold text-slate-700 mb-2">Excerpt (Optional)</label>
							<textarea
								name="excerpt"
								rows="3"
								class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
								placeholder="A brief summary for the list view..."
							>
								{post?.excerpt || ''}
							</textarea>
						</div>
					</div>
				</form>
			</div>
		);
	},
});

export default AdminPostEditor;
