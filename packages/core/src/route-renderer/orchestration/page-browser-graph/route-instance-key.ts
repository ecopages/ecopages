import type { PageParams, PageQuery } from '../../../types/public-types.ts';

export type PageDependencyInstance = {
	params?: PageParams;
	query?: PageQuery;
};

export type GroupedGraphScope = {
	integrationName: string;
	planKey: string;
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

/**
 * Combines a route file with an optional dependency-instance key for grouped graph maps.
 */
export function createRouteGraphLookupKey(routeFile: string, dependencyInstanceKey = ''): string {
	return JSON.stringify([routeFile, dependencyInstanceKey]);
}

/**
 * Serializes the grouped graph cache scope for one integration and dependency instance.
 */
export function serializeGroupedGraphCacheKey(scope: GroupedGraphScope): string {
	return JSON.stringify(['grouped', scope.integrationName, scope.planKey]);
}

/**
 * Reconstructs dependency resolver inputs from a serialized dependency-instance key.
 */
export function parsePageDependencyInstanceKey(dependencyInstanceKey: string): PageDependencyInstance {
	if (!dependencyInstanceKey) {
		return {};
	}

	const parsed: unknown = JSON.parse(dependencyInstanceKey);
	if (!isSerializedDependencyInstance(parsed)) {
		throw new TypeError('Invalid page dependency instance key.');
	}

	return {
		...(parsed.params.length > 0 ? { params: Object.fromEntries(parsed.params) } : {}),
		...(parsed.query.length > 0 ? { query: Object.fromEntries(parsed.query) } : {}),
	};
}

function canonicalizeInput(input: PageParams | PageQuery | undefined): Array<[string, string | string[]]> {
	return Object.entries(input ?? {})
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]);
}

function isSerializedDependencyInstance(
	value: unknown,
): value is { params: Array<[string, string | string[]]>; query: Array<[string, string | string[]]> } {
	if (!value || typeof value !== 'object' || !('params' in value) || !('query' in value)) {
		return false;
	}

	return Array.isArray(value.params) && Array.isArray(value.query);
}
