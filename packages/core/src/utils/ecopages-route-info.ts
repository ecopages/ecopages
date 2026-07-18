import type { EcopagesRouteInfo } from '../types/public-types.ts';
import { normalizePathname } from './path-pattern.ts';

/**
 * Maps a static-generation or registry route into the public slim route shape.
 */
export function toEcopagesRouteInfo(route: {
	pathname: string;
	params: Record<string, string | string[]>;
}): EcopagesRouteInfo {
	return {
		pathname: normalizePathname(route.pathname),
		params: normalizeRouteParams(route.params),
	};
}

/**
 * Flattens string | string[] route params into string values for public APIs.
 */
export function normalizeRouteParams(params: Record<string, string | string[]>): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(params)) {
		normalized[key] = Array.isArray(value) ? value.join('/') : value;
	}
	return normalized;
}

type StaticGenerationRouteLister = (input: {
	runtimeOrigin: string;
}) => Promise<readonly { pathname: string; params: Record<string, string | string[]> }[]>;

/**
 * Resolves {@link EcopagesRouteInfo} entries for app-start and similar consumers.
 */
export async function resolveAppStartRoutes(input: {
	listStaticGenerationRoutes?: StaticGenerationRouteLister;
	runtimeOrigin: string;
}): Promise<EcopagesRouteInfo[]> {
	if (!input.listStaticGenerationRoutes) {
		return [];
	}

	const routes = await input.listStaticGenerationRoutes({ runtimeOrigin: input.runtimeOrigin });
	return routes.map(toEcopagesRouteInfo);
}
