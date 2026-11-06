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

/** Sidebar sections of the developer area, in display order. */
export const DEV_SECTION_ORDER = ['overview', 'build', 'rendering', 'development', 'hmr', 'packages'] as const;

export type DevSectionId = (typeof DEV_SECTION_ORDER)[number];

/** Slug of the overview entry, served at `/dev` instead of `/dev/index`. */
export const DEV_INDEX_SLUG = 'index';

export const DEV_SECTION_TITLES: Record<DevSectionId, string> = {
	overview: 'Overview',
	build: 'Build',
	rendering: 'Rendering',
	development: 'Development',
	hmr: 'HMR',
	packages: 'Packages',
};

export function devEntryHref(slug: string): string {
	return slug === DEV_INDEX_SLUG ? DEV_ROOT : `${DEV_ROOT}/${slug}`;
}

export const devFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	section: z.enum(DEV_SECTION_ORDER),
	order: z.coerce.number().optional(),
	/**
	 * Repository paths the page describes: a directory ends with `/`. Metadata for readers and
	 * maintainers; nothing in CI checks it.
	 */
	sources: z.array(z.string()).min(1),
});

export type DevFrontmatter = z.infer<typeof devFrontmatterSchema>;

export type DevContentEntry = ContentEntry<DevFrontmatter>;

export function compareDevEntries(a: DevContentEntry, b: DevContentEntry): number {
	return (a.order ?? 0) - (b.order ?? 0);
}
