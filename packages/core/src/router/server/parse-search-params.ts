import type { PageQuery } from '../../types/contracts.ts';

/**
 * Parses URL search parameters without discarding repeated keys.
 *
 * @remarks
 * A key with one value stays a string. Repeated values become an array in their
 * original order, matching the query shape exposed to page and API handlers.
 */
export function parseSearchParams(searchParams: URLSearchParams): PageQuery {
	const valuesByKey = new Map<string, string[]>();
	for (const [key, value] of searchParams) {
		const values = valuesByKey.get(key) ?? [];
		values.push(value);
		valuesByKey.set(key, values);
	}

	return Object.fromEntries(
		[...valuesByKey].map(([key, values]) => [key, values.length === 1 ? values[0]! : values]),
	);
}
