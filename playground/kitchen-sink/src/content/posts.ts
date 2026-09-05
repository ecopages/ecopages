import { compareEntriesByField } from '@ecopages/content-processor';
import type { ContentEntry } from '@ecopages/content-processor/types';
import { z } from 'zod';

export const POSTS_CONTENT_DIR = 'content/posts';

export const postFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	order: z.coerce.number().optional(),
});

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;

export type PostContentEntry = ContentEntry<PostFrontmatter>;

export const comparePosts = compareEntriesByField<PostFrontmatter, 'order'>('order');
