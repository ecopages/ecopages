import type { PageParams, PageQuery } from '../../../types/contracts.ts';

type PageDependencyInstance = {
	params?: PageParams;
	query?: PageQuery;
};

export type GroupedGraphScope = {
	integrationName: string;
	planKey: string;
};

function formatParamEntries(entries: Iterable<[string, string | string[]]>): string {
	return [...entries].map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('/') : value}`).join(',');
}

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
 * Formats Params for a missing production Page Browser Graph error.
 */
export function describePageDependencyInstance(input: PageDependencyInstance): string {
	const params = canonicalizeInput(input.params);
	if (params.length === 0) return 'default';
	return formatParamEntries(params);
}

/**
 * Params encoded in a {@link createPageDependencyInstanceKey} value, ignoring query.
 */
export function pageDependencyInstanceParams(
	dependencyInstanceKey: string,
): Array<[string, string | string[]]> | undefined {
	if (dependencyInstanceKey.length === 0) return [];
	try {
		const parsed: unknown = JSON.parse(dependencyInstanceKey);
		if (typeof parsed !== 'object' || parsed === null || !('params' in parsed)) {
			return undefined;
		}
		const params = (parsed as { params?: unknown }).params;
		if (!Array.isArray(params)) return undefined;
		const entries: Array<[string, string | string[]]> = [];
		for (const item of params) {
			if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
				return undefined;
			}
			const value = item[1];
			if (
				typeof value !== 'string' &&
				!(Array.isArray(value) && value.every((part) => typeof part === 'string'))
			) {
				return undefined;
			}
			entries.push([item[0], value]);
		}
		return entries;
	} catch {
		return undefined;
	}
}

/**
 * Formats a {@link createPageDependencyInstanceKey} value for a missing-manifest error.
 */
export function describePageDependencyInstanceKey(dependencyInstanceKey: string): string {
	const params = pageDependencyInstanceParams(dependencyInstanceKey);
	if (params === undefined) return dependencyInstanceKey;
	if (params.length === 0) return 'default';
	return formatParamEntries(params);
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

function canonicalizeInput(input: PageParams | PageQuery | undefined): Array<[string, string | string[]]> {
	return Object.entries(input ?? {})
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]);
}
