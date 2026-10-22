import { count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './db.server';
import { posts } from './schema';

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PublishedPost = Post & { published_at: Date };

export const POSTS_PER_PAGE = 9;

const published = isNotNull(posts.published_at);

function onlyPublished(rows: Post[]): PublishedPost[] {
	return rows.filter((post): post is PublishedPost => post.published_at !== null);
}

export const postsService = {
	/** Every post for the author area: drafts first, then the newest published. */
	listAll: () =>
		db
			.select()
			.from(posts)
			.orderBy(sql`${posts.published_at} is null desc`, desc(posts.published_at), desc(posts.id)),

	/** One page of published posts, newest first; `page` starts at 1. */
	listPublished: async (page: number, perPage = POSTS_PER_PAGE) =>
		onlyPublished(
			await db
				.select()
				.from(posts)
				.where(published)
				.orderBy(desc(posts.published_at), desc(posts.id))
				.limit(perPage)
				.offset((page - 1) * perPage),
		),

	countPublishedPages: async (perPage = POSTS_PER_PAGE) => {
		const [{ total }] = await db.select({ total: count() }).from(posts).where(published);
		return Math.max(1, Math.ceil(total / perPage));
	},

	findPublishedBySlug: async (slug: string) =>
		onlyPublished(await db.select().from(posts).where(eq(posts.slug, slug)))[0],

	findById: async (id: number) => (await db.select().from(posts).where(eq(posts.id, id)))[0],

	create: async (post: NewPost) => (await db.insert(posts).values(post).returning())[0],

	update: async (id: number, post: Partial<NewPost>) =>
		(await db.update(posts).set(post).where(eq(posts.id, id)).returning())[0],

	remove: (id: number) => db.delete(posts).where(eq(posts.id, id)),
};
