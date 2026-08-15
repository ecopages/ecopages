import type { ContentEntry } from '@ecopages/content-processor/types';
import { z } from 'zod';
import generatedSortOrder from './wiki-sort-order.json' with { type: 'json' };

/** Public URL prefix for wiki pages. */
export const WIKI_ROOT = '/wiki';

export const wikiFrontmatterSchema = z.object({
	title: z.string(),
	category: z.string(),
	order: z.number().optional(),
	sources: z.array(z.string()).optional(),
	updated: z.string(),
});

export type WikiFrontmatter = z.infer<typeof wikiFrontmatterSchema>;

export type WikiContentEntry = ContentEntry<WikiFrontmatter>;

/** Frontmatter read from a source page before its storage layout supplies a category. */
export const wikiSourceFrontmatterSchema = wikiFrontmatterSchema.extend({
	category: z.string().optional(),
});

export type WikiSourceFrontmatter = z.infer<typeof wikiSourceFrontmatterSchema>;

/** A public category or page identifier accepted in generated paths and URLs. */
export const wikiIdentifierSchema = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase kebab-case identifier');

/** Derives the category from a slug like `app/demo` -> `app`. */
export function categoryFromSlug(slug: string): string {
	const slash = slug.indexOf('/');
	return slash === -1 ? slug : slug.slice(0, slash);
}

/** Returns the normalized category emitted for a wiki collection entry. */
export function getCategoryForEntry(entry: ContentEntry<Record<string, unknown>>): string {
	return (entry as WikiContentEntry).category;
}

/**
 * Converts a kebab-case directory name to a human-readable title.
 * @example formatCategoryTitle("getting-started") // "Getting Started"
 * @example formatCategoryTitle("app") // "App"
 */
export function formatCategoryTitle(dirName: string): string {
	return dirName
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

type SortOrderData = {
	categories: string[];
	pages: Record<string, string[]>;
};

/**
 * Category ordering and per-category page ordering from `sortspec.md` files.
 * The `categories` array controls directory order. The `pages` map controls
 * page order within each category.
 */
const sortOrder: SortOrderData = generatedSortOrder;

const categoryOrderIndex = new Map<string, number>(sortOrder.categories.map((cat, index) => [cat, index]));

const sortOrderIndex = new Map<string, number>();
for (const [category, titles] of Object.entries(sortOrder.pages)) {
	for (let i = 0; i < titles.length; i++) {
		sortOrderIndex.set(`${category}/${titles[i]}`, i);
	}
}

/** Returns the ordered list of category directory names. */
export function getCategoryOrder(): string[] {
	return sortOrder.categories;
}

/**
 * Sorts entries by category order (from root sortspec), then by explicit sort
 * order (from per-directory sortspec or frontmatter order field), then by
 * title alphabetically.
 *
 * @remarks
 * Typed over `ContentEntry<Record<string, unknown>>` (not `WikiContentEntry`)
 * so this satisfies `EntryComparator<Record<string, unknown>>` — the type the
 * collections map contextually requires — without a parameter-variance error.
 */
export function compareWikiEntries(
	a: ContentEntry<Record<string, unknown>>,
	b: ContentEntry<Record<string, unknown>>,
): number {
	const entryA = a as WikiContentEntry;
	const entryB = b as WikiContentEntry;
	const categoryA = getCategoryForEntry(entryA);
	const categoryB = getCategoryForEntry(entryB);
	const catOrderA = categoryOrderIndex.get(categoryA) ?? Number.MAX_SAFE_INTEGER;
	const catOrderB = categoryOrderIndex.get(categoryB) ?? Number.MAX_SAFE_INTEGER;

	if (catOrderA !== catOrderB) {
		return catOrderA - catOrderB;
	}

	const sortKeyA = `${categoryA}/${entryA.title}`;
	const sortKeyB = `${categoryB}/${entryB.title}`;
	const sortA = sortOrderIndex.get(sortKeyA) ?? Number.MAX_SAFE_INTEGER;
	const sortB = sortOrderIndex.get(sortKeyB) ?? Number.MAX_SAFE_INTEGER;

	if (sortA !== sortB) {
		return sortA - sortB;
	}

	if (entryA.order !== entryB.order) {
		const orderA = entryA.order ?? Number.MAX_SAFE_INTEGER;
		const orderB = entryB.order ?? Number.MAX_SAFE_INTEGER;
		return orderA - orderB;
	}

	return entryA.title.localeCompare(entryB.title);
}
