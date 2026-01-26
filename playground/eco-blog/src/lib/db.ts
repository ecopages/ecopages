import { eq, desc } from 'drizzle-orm';
import { db } from './shared-db';
import { posts } from './schema';

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const dbService = {
	getAllPosts: async () => {
		return db.select().from(posts).orderBy(desc(posts.published_at));
	},

	getPostBySlug: async (slug: string) => {
		const result = await db.select().from(posts).where(eq(posts.slug, slug));
		return result[0];
	},

	createPost: async (post: NewPost) => {
		const result = await db.insert(posts).values(post).returning();
		return result[0];
	},

	updatePost: async (id: number, post: Partial<NewPost>) => {
		return db.update(posts).set(post).where(eq(posts.id, id)).returning();
	},

	deletePost: async (id: number) => {
		return db.delete(posts).where(eq(posts.id, id));
	},
};
