import type { PageParams } from '../../../types/public-types.ts';

export type GroupedGraphScope = {
	integrationName: string;
	routeInstanceKey?: string;
};

/**
 * Builds a stable cache key for one concrete route instance behind a template route file.
 */
export function createRouteInstanceKey(input: { params?: PageParams }): string {
	if (!input.params || Object.keys(input.params).length === 0) {
		return '';
	}

	return Object.entries(input.params)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => {
			const serialized = Array.isArray(value) ? value.join('/') : value;
			return `${key}=${serialized}`;
		})
		.join('&');
}

/**
 * Combines a route file with an optional route-instance key for grouped graph maps.
 */
export function createRouteGraphLookupKey(routeFile: string, routeInstanceKey = ''): string {
	return routeInstanceKey ? `${routeFile}::${routeInstanceKey}` : routeFile;
}

/**
 * Serializes the grouped graph cache scope for one integration and route instance.
 */
export function serializeGroupedGraphCacheKey(scope: GroupedGraphScope): string {
	const routeInstanceKey = scope.routeInstanceKey ?? '';
	return `grouped::${scope.integrationName}::${routeInstanceKey}`;
}

/**
 * Reconstructs route params from a serialized route-instance key.
 */
export function parseRouteInstanceKey(routeInstanceKey: string): PageParams {
	if (!routeInstanceKey) {
		return {};
	}

	return Object.fromEntries(
		routeInstanceKey.split('&').map((entry) => {
			const separatorIndex = entry.indexOf('=');
			if (separatorIndex === -1) {
				return [entry, ''];
			}

			const key = entry.slice(0, separatorIndex);
			const value = entry.slice(separatorIndex + 1);
			return [key, value.includes('/') ? value.split('/') : value];
		}),
	);
}
