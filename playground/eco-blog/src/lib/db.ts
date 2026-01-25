import { db } from './shared-db';

export interface Post {
	id?: number;
	title: string;
	slug: string;
	content: string;
	excerpt?: string;
	published_at?: string;
}

export const dbService = {
	getAllPosts: (): Post[] => {
		return db.query('SELECT * FROM posts ORDER BY published_at DESC').all() as Post[];
	},

	getPostBySlug: (slug: string): Post | undefined => {
		return db.query('SELECT * FROM posts WHERE slug = ?').get(slug) as Post | undefined;
	},

	createPost: (post: Post) => {
		return db.run('INSERT INTO posts (title, slug, content, excerpt) VALUES (?, ?, ?, ?)', [
			post.title,
			post.slug,
			post.content,
			post.excerpt || '',
		]).lastInsertRowid;
	},

	updatePost: (id: number, post: Partial<Post>) => {
		const sets: string[] = [];
		const values: any[] = [];

		if (post.title) {
			sets.push('title = ?');
			values.push(post.title);
		}
		if (post.slug) {
			sets.push('slug = ?');
			values.push(post.slug);
		}
		if (post.content) {
			sets.push('content = ?');
			values.push(post.content);
		}
		if (post.excerpt) {
			sets.push('excerpt = ?');
			values.push(post.excerpt);
		}

		values.push(id);
		return db.run(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, values);
	},

	deletePost: (id: number) => {
		return db.run('DELETE FROM posts WHERE id = ?', [id]);
	},
};
