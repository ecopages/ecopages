import { appLogger } from '../global/app-logger.ts';
import type { MatchResult, Route, Routes } from '../internal-types.ts';
import type { FSRouterScanner } from './fs-router-scanner.ts';

/**
 * A class that manages the routes of the file system.
 * It scans the file system for files with the specified extensions and creates a map of routes.
 * It also provides a method to match a request to a route.
 * It can be used to reload the routes when the file system changes.
 */
export class FSRouter {
	origin: string;
	assetPrefix: string;
	routes: Routes = {};
	scanner: FSRouterScanner;
	onReload?: () => void;

	constructor({ origin, assetPrefix, scanner }: { origin: string; assetPrefix: string; scanner: FSRouterScanner }) {
		this.origin = origin;
		this.assetPrefix = assetPrefix;
		this.scanner = scanner;
	}

	async init() {
		this.routes = await this.scanner.scan();
		appLogger.debug('FSRouter initialized', this.routes);
	}

	getDynamicParams(route: Route, pathname: string): Record<string, string | string[]> {
		const params: Record<string, string | string[]> = {};
		const routeParts = route.pathname.split('/');
		const pathnameParts = pathname.split('/');

		for (let i = 0; i < routeParts.length; i++) {
			const part = routeParts[i];
			if (part.startsWith('[') && part.endsWith(']')) {
				if (part.startsWith('[...')) {
					const param = part.slice(4, -1);
					params[param] = pathnameParts.slice(i);
					break;
				}
				const param = part.slice(1, -1);
				params[param] = pathnameParts[i];
			}
		}
		return params;
	}

	getSearchParams(url: URL): Record<string, string> {
		const query: Record<string, string> = {};
		for (const [key, value] of url.searchParams) {
			query[key] = value;
		}
		return query;
	}

	match(requestUrl: string): MatchResult | null {
		const url = new URL(requestUrl);
		const pathname = url.pathname.replace(this.origin, '');

		const routeValues = Object.values(this.routes);

		for (const route of routeValues) {
			if (route.kind === 'exact' && (pathname === route.pathname || pathname === `${route.pathname}/`)) {
				return {
					filePath: route.filePath,
					kind: 'exact',
					pathname: route.pathname,
					query: this.getSearchParams(url),
				};
			}
		}

		for (const route of routeValues) {
			const cleanPathname = route.pathname.replace(/\[.*?\]/g, '');
			const isValidDynamicRoute = pathname.includes(cleanPathname);

			if (route.kind === 'dynamic' && isValidDynamicRoute) {
				const routeParts = route.pathname.split('/');
				const pathnameParts = pathname.split('/');

				if (routeParts.length === pathnameParts.length) {
					return {
						filePath: route.filePath,
						kind: 'dynamic',
						pathname: route.pathname,
						query: this.getSearchParams(url),
						params: this.getDynamicParams(route, pathname),
					};
				}
			}
		}

		for (const route of routeValues) {
			const cleanPathname = route.pathname.replace(/\[.*?\]/g, '');
			const isValidCatchAllRoute = pathname.includes(cleanPathname);

			if (route.kind === 'catch-all' && isValidCatchAllRoute) {
				return {
					filePath: route.filePath,
					kind: 'catch-all',
					pathname: route.pathname,
					query: this.getSearchParams(url),
					params: this.getDynamicParams(route, pathname),
				};
			}
		}

		return null;
	}

	setOnReload(cb: () => void) {
		this.onReload = cb;
	}

	reload() {
		this.init();
		if (this.onReload) {
			this.onReload();
		}
	}
}
