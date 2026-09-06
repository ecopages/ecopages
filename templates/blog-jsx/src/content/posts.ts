import type { ContentEntry } from '@ecopages/content-processor/types';
import { z } from 'zod';
import { POST_IMAGE_IMPORTS } from './post-image-imports';

export const POSTS_CONTENT_DIR = 'content/posts' as const;

export const postsFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	excerpt: z.string(),
	date: z.iso.date('Expected ISO date in YYYY-MM-DD format'),
	image: z.enum(POST_IMAGE_IMPORTS),
});

export type PostFrontmatter = z.infer<typeof postsFrontmatterSchema>;
export type PostEntry = ContentEntry<PostFrontmatter>;

export function comparePosts(a: PostEntry, b: PostEntry): number {
	return b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);
}
