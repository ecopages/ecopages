import type { ContentEntry } from '@ecopages/content-processor/types';
import { z } from 'zod';

export const postsFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	excerpt: z.string(),
	order: z.coerce.number().optional(),
});

export type PostFrontmatter = z.infer<typeof postsFrontmatterSchema>;
export type PostEntry = ContentEntry<PostFrontmatter>;

export function comparePosts(a: PostEntry, b: PostEntry): number {
	return (a.order ?? 0) - (b.order ?? 0);
}
