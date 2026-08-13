import type { EcoComponent, PageDependenciesResult } from '@ecopages/core';
import type { EntryComparator } from './sort.ts';

export type { EntryComparator } from './sort.ts';

/**
 * Content entry metadata produced by the content processor.
 * Frontmatter fields come from the collection schema declared in processor config.
 */
export type ContentEntry<T extends Record<string, unknown> = Record<string, unknown>> = T & {
	/** Joined slug segments, e.g. `getting-started/introduction`. */
	slug: string;
	/** Path segments relative to the content root, e.g. `['getting-started', 'introduction']`. */
	segments: string[];
};

/** @deprecated Use {@link EntryComparator} instead. */
export type OrderBy<T extends Record<string, unknown> = Record<string, unknown>> = EntryComparator<T>;

/** Runtime shape of a generated `ecopages:content/<collection>` entries module. */
export type ContentCollectionEntriesModule<TEntry extends Record<string, unknown> = Record<string, unknown>> = {
	readonly entries: readonly ContentEntry<TEntry>[];
	/**
	 * Lookup by joined slug.
	 * @throws HttpError 404 when the slug is not in the collection.
	 */
	getEntry(slug: string): ContentEntry<TEntry>;
	/**
	 * Lookup by path segments.
	 * @throws HttpError 404 when no entry matches the segments.
	 */
	getEntryBySegments(segments: string[]): ContentEntry<TEntry>;
};

/** Runtime shape of a generated `ecopages:content/<collection>/server` module. */
export type ContentCollectionComponentsModule = {
	/**
	 * Lazy-loads the MDX component for one slug.
	 * @throws HttpError 404 when the slug is not in the collection.
	 */
	getComponent(slug: string): Promise<EcoComponent<Record<string, unknown>>>;
	/**
	 * Browser dependency bag for one slug, with MDX source ownership.
	 * @throws HttpError 404 when the slug is not in the collection.
	 */
	getEntryDependencies(slug: string): Promise<PageDependenciesResult | undefined>;
};

/** @deprecated Import entries and server modules separately. */
export type ContentCollectionModule<TEntry extends Record<string, unknown> = Record<string, unknown>> =
	ContentCollectionEntriesModule<TEntry> & ContentCollectionComponentsModule;
