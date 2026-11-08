import type { JsxRenderable } from '@ecopages/jsx';
import { formatDate } from '@/lib/format';
import type { PublishedPost } from '@/lib/posts.server';
import './post-card.css';

/** One post in the home list; the title link covers the whole card. */
export function PostCard({ post }: { post: PublishedPost }): JsxRenderable {
	return (
		<li class="post-card">
			<h2 class="post-card__title">
				<a class="post-card__link" href={`/posts/${post.slug}`}>
					{post.title}
				</a>
			</h2>
			<time class="post-card__date" datetime={post.published_at.toISOString()}>
				{formatDate(post.published_at)}
			</time>
			<p class="post-card__excerpt">{post.excerpt ?? ''}</p>
		</li>
	);
}
