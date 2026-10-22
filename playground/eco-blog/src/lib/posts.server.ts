import { desc, eq } from 'drizzle-orm';
import { db } from './db.server';
import { posts } from './schema';

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const postsService = {
	list: () => db.select().from(posts).orderBy(desc(posts.published_at)),

	findBySlug: async (slug: string) => (await db.select().from(posts).where(eq(posts.slug, slug)))[0],

	findById: async (id: number) => (await db.select().from(posts).where(eq(posts.id, id)))[0],

	create: async (post: NewPost) => (await db.insert(posts).values(post).returning())[0],

	update: async (id: number, post: Partial<NewPost>) =>
		(await db.update(posts).set(post).where(eq(posts.id, id)).returning())[0],

	remove: (id: number) => db.delete(posts).where(eq(posts.id, id)),
};
