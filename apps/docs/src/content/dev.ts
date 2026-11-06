import type { ContentEntry } from '@ecopages/content-processor/types';
import type { PageRobotsMetadata } from '@ecopages/core';
import { z } from 'zod';

/**
 * Public URL prefix for the developer area.
 *
 * @remarks
 * The area documents the framework's internals for maintainers. It is its own collection, so the
 * docs sidebar, pagination and `llms.txt`, which read only the `docs` collection, never list it.
 */
export const DEV_ROOT = '/dev';

/**
 * Robots directives for every developer page.
 *
 * @remarks
 * `index: false` emits `<meta name="robots" content="noindex">` and keeps the page out of
 * `sitemap.xml`, so the area stays out of search results while its links still work.
 */
export const DEV_ROBOTS: PageRobotsMetadata = { index: false };

export const devFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	order: z.coerce.number().optional(),
	/**
	 * Repository paths the page describes: a directory ends with `/`. A change to one of them
	 * means the page needs a look.
	 */
	sources: z.array(z.string()).min(1),
});

export type DevFrontmatter = z.infer<typeof devFrontmatterSchema>;

export type DevContentEntry = ContentEntry<DevFrontmatter>;

export function compareDevEntries(a: DevContentEntry, b: DevContentEntry): number {
	return (a.order ?? 0) - (b.order ?? 0);
}
