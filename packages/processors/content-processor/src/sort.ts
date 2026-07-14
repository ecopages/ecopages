import type { ContentEntry } from './types.ts';

export type EntryComparator<T extends Record<string, unknown> = Record<string, unknown>> = (
	a: ContentEntry<T>,
	b: ContentEntry<T>,
) => number;

/** Default manifest sort: slug segments in path order. */
export function compareEntriesBySlug<T extends Record<string, unknown>>(
	a: ContentEntry<T>,
	b: ContentEntry<T>,
): number {
	return a.slug.localeCompare(b.slug);
}

/**
 * Sort by a validated frontmatter field.
 *
 * @remarks
 * The caller must ensure the field exists on entries validated by the collection schema.
 */
export function compareEntriesByField<T extends Record<string, unknown>, K extends keyof T>(
	field: K,
): EntryComparator<T> {
	return (a, b) => {
		const left = a[field];
		const right = b[field];

		if (typeof left === 'number' && typeof right === 'number') {
			return left - right || compareEntriesBySlug(a, b);
		}

		if (typeof left === 'string' && typeof right === 'string') {
			return left.localeCompare(right) || compareEntriesBySlug(a, b);
		}

		return compareEntriesBySlug(a, b);
	};
}
