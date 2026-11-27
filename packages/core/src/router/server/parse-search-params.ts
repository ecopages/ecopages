import type { PageQuery } from '../../types/contracts.ts';

/**
 * Groups key and value pairs into a plain object without discarding repeated keys.
 *
 * @remarks
 * A key with one value keeps it. Repeated values become an array in their original order. Properties
 * are defined, not assigned, so a key named `__proto__` is an own key and cannot change the prototype.
 * Query strings and HTML form bodies share this shape.
 */
export function groupRepeatedKeys<T>(entries: Iterable<[string, T]>): Record<string, T | T[]> {
	const valuesByKey = new Map<string, T[]>();
	for (const [key, value] of entries) {
		const values = valuesByKey.get(key) ?? [];
		values.push(value);
		valuesByKey.set(key, values);
	}

	return Object.fromEntries(
		[...valuesByKey].map(([key, values]) => [key, values.length === 1 ? values[0]! : values]),
	);
}

/**
 * Parses URL search parameters without discarding repeated keys.
 *
 * @remarks
 * A key with one value stays a string. Repeated values become an array in their
 * original order, matching the query shape exposed to page and API handlers.
 */
export function parseSearchParams(searchParams: URLSearchParams): PageQuery {
	return groupRepeatedKeys(searchParams);
}
