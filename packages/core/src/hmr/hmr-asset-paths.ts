import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';

export const DEV_TRANSFORM_URL_PREFIX = `/${RESOLVED_ASSETS_DIR}/__eco_dev__`;

/**
 * Strips cache-busting query parameters from a browser module URL.
 */
export function stripModuleUrlQuery(moduleUrl: string): string {
	return moduleUrl.split('?')[0] ?? moduleUrl;
}

/**
 * Returns true when a module URL is served by the dev transform server.
 */
export function isDevTransformModuleUrl(moduleUrl: string): boolean {
	return stripModuleUrlQuery(moduleUrl).startsWith(`${DEV_TRANSFORM_URL_PREFIX}/`);
}

/**
 * Appends a cache-busting query parameter for hot module imports.
 */
export function withModuleCacheBust(moduleUrl: string, timestamp?: number): string {
	const basePath = stripModuleUrlQuery(moduleUrl);
	return `${basePath}?t=${timestamp ?? Date.now()}`;
}
