import type { PageParams, PageQuery } from '../../../types/contracts.ts';

type PageDependencyInstance = {
	params?: PageParams;
	query?: PageQuery;
};

/**
 * Builds a stable cache key for one concrete dependency resolver input.
 *
 * @remarks
 * The representation deliberately retains scalar versus array values. Delimiter-based
 * encodings would make otherwise distinct route inputs collide.
 */
export function createPageDependencyInstanceKey(input: PageDependencyInstance): string {
	const params = canonicalizeInput(input.params);
	const query = canonicalizeInput(input.query);
	if (params.length === 0 && query.length === 0) {
		return '';
	}

	return JSON.stringify({ params, query });
}

function canonicalizeInput(input: PageParams | PageQuery | undefined): Array<[string, string | string[]]> {
	return Object.entries(input ?? {})
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]);
}
