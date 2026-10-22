import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { RuiTextarea } from '@ecopages/radiant-ui/textarea';
import { RadiantEditor } from '@/components/radiant-editor/radiant-editor';
import type { Post } from '@/lib/posts.server';
import './post-editor.css';

/**
 * Create or edit form; `post-editor.script.ts` fills the slug from the title until the slug is edited.
 *
 * @remarks
 * The two submit buttons send `intent`: `draft` keeps or turns the post into a draft, `publish` publishes it.
 */
export const PostEditor = eco.component<{ post?: Post }, JsxRenderable>({
	dependencies: { scripts: ['./post-editor.script.ts'] },
	render: ({ post }) => (
		<form id="post-form" class="post-editor" action={post ? `/api/posts/${post.id}` : '/api/posts'} method="post">
			<header class="post-editor__header">
				<h1>{post ? 'Edit post' : 'New post'}</h1>
				<div class="post-editor__actions">
					<RuiButton href="/admin" variant="outline">
						Cancel
					</RuiButton>
					<RuiButton type="submit" variant="outline" attr:name="intent" attr:value="draft">
						{post?.published_at ? 'Unpublish' : 'Save draft'}
					</RuiButton>
					<RuiButton type="submit" variant="filled" attr:name="intent" attr:value="publish">
						{post?.published_at ? 'Update post' : 'Publish post'}
					</RuiButton>
				</div>
			</header>

			<div class="post-editor__field">
				<label class="rui-label" for="post-title">
					Title
				</label>
				<RuiInput id="post-title" name="title" value={post?.title ?? ''} attr:required="" />
			</div>

			<div class="post-editor__field">
				<label class="rui-label" for="post-slug">
					Slug
				</label>
				<div class="post-editor__slug">
					<span aria-hidden="true">/posts/</span>
					<RuiInput
						id="post-slug"
						name="slug"
						value={post?.slug ?? ''}
						attr:pattern="[a-z0-9]+(-[a-z0-9]+)*"
						aria-describedby="post-slug-hint"
						attr:required=""
					/>
				</div>
				<p id="post-slug-hint" class="post-editor__hint">
					Lowercase letters, numbers and dashes. The post's URL is /posts/ and the slug.
				</p>
			</div>

			<div class="post-editor__field">
				<span id="post-content-label" class="rui-label">
					Content
				</span>
				<RadiantEditor name="content" content={post?.content} labelledBy="post-content-label" />
			</div>

			<div class="post-editor__field">
				<label class="rui-label" for="post-excerpt">
					Excerpt (optional)
				</label>
				<RuiTextarea id="post-excerpt" name="excerpt" value={post?.excerpt ?? ''} rows={3} />
			</div>
		</form>
	),
});
