import type { EcoComponent } from '@ecopages/core';
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

/** Runtime shape of a generated `ecopages:content/<collection>` module. */
export type ContentCollectionModule<TEntry extends Record<string, unknown> = Record<string, unknown>> = {
	readonly entries: readonly ContentEntry<TEntry>[];
	getEntry(slug: string): ContentEntry<TEntry>;
	getEntryBySegments(segments: string[]): ContentEntry<TEntry>;
	getComponent(slug: string): EcoComponent<Record<string, unknown>>;
};
