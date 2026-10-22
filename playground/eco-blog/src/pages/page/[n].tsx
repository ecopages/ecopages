import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { z } from 'zod';
import { Pagination } from '@/components/pagination/pagination';
import { PostCard } from '@/components/post-card/post-card';
import { SiteLayout } from '@/layouts/site-layout/site-layout';
import { postsService, type PublishedPost } from '@/lib/posts.server';
import '../index.css';

type ArchiveProps = { posts: PublishedPost[]; page: number; pageCount: number };

const pageParams = z.object({ n: z.coerce.number().int().min(2) });

export default eco.page<ArchiveProps, JsxRenderable>({
	layout: SiteLayout,
	cache: 'dynamic',
	staticProps: async ({ pathname }) => {
		const parsed = pageParams.safeParse(pathname.params);
		const pageCount = await postsService.countPublishedPages();
		if (!parsed.success || parsed.data.n > pageCount) throw HttpError.NotFound('Page not found');
		return { props: { posts: await postsService.listPublished(parsed.data.n), page: parsed.data.n, pageCount } };
	},
	metadata: ({ props }) => ({
		title: `Older posts, page ${props.page} | EcoBlog`,
		description: `Posts on page ${props.page} of ${props.pageCount}.`,
	}),
	render: ({ posts, page, pageCount }) => (
		<>
			<header class="home-intro breakout">
				<h1>Older posts</h1>
				<p>
					Page {page} of {pageCount}.
				</p>
			</header>
			<ul class="post-grid breakout" role="list">
				{posts.map((post) => (
					<PostCard post={post} />
				))}
			</ul>
			<Pagination page={page} pageCount={pageCount} />
		</>
	),
});
