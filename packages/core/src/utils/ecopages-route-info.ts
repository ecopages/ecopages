import type { EcopagesRouteInfo } from '../types/contracts.ts';
import { normalizePathname } from './path-pattern.ts';

/**
 * Maps a static-generation or registry route into the public slim route shape.
 */
export function toEcopagesRouteInfo(route: {
	pathname: string;
	params: EcopagesRouteInfo['params'];
}): EcopagesRouteInfo {
	return {
		pathname: normalizePathname(route.pathname),
		params: route.params,
	};
}

type StaticGenerationRouteLister = (input: {
	runtimeOrigin: string;
}) => Promise<readonly { pathname: string; params: EcopagesRouteInfo['params'] }[]>;

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
