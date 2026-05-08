import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, RouteKind } from '../../types/internal-types.ts';
import { invariant } from '../../utils/invariant.ts';

export type RouteParams = Record<string, string | string[]>;
export type RouteQuery = Record<string, string>;

export type TemplateRoute = {
	readonly pathname: string;
	readonly kind: RouteKind;
	readonly filePath: string;
	readonly paramNames: readonly string[];
};

export type RouteMatch = {
	readonly requestedPathname: string;
	readonly templateRoute: TemplateRoute;
	readonly params: RouteParams;
	readonly query: RouteQuery;
};

export type StaticPathExpansion = {
	readonly pathname: string;
	readonly templateRoute: TemplateRoute;
	readonly params: RouteParams;
};

export type StaticGenerationRoute = {
	readonly requestUrl: string;
	readonly pathname: string;
	readonly templateRoute: TemplateRoute;
	readonly params: RouteParams;
};

export type StaticPathsContext = {
	readonly appConfig: EcoPagesAppConfig;
	readonly runtimeOrigin: string;
};

export type RouteRegistryPageModule = {
	readonly staticPaths?: (context: StaticPathsContext) => Promise<{
		paths: Array<{ params: RouteParams }>;
	}>;
	readonly staticProps?: unknown;
};

export interface RouteRegistryPageModuleAdapter {
	loadPageModule(filePath: string): Promise<RouteRegistryPageModule>;
}

export type RouteRegistryOptions = {
	pagesDir: string;
	appConfig: EcoPagesAppConfig;
	origin: string;
	templatesExt: readonly string[];
	buildMode: boolean;
	pageModuleAdapter: RouteRegistryPageModuleAdapter;
};

const ROUTE_PRIORITY: Record<RouteKind, number> = {
	exact: 0,
	dynamic: 1,
	'catch-all': 2,
};

export class RouteRegistry {
	readonly origin: string;
	readonly appConfig: EcoPagesAppConfig;
	readonly pagesDir: string;
	readonly templatesExt: readonly string[];
	readonly buildMode: boolean;
	private readonly pageModuleAdapter: RouteRegistryPageModuleAdapter;
	private templateRouteList: TemplateRoute[] = [];
	private readonly reloadListeners = new Set<() => void>();

	constructor(options: RouteRegistryOptions) {
		this.origin = options.origin;
		this.appConfig = options.appConfig;
		this.pagesDir = options.pagesDir;
		this.templatesExt = options.templatesExt;
		this.buildMode = options.buildMode;
		this.pageModuleAdapter = options.pageModuleAdapter;
	}

	get templateRoutes(): readonly TemplateRoute[] {
		return this.templateRouteList;
	}

	async init(): Promise<void> {
		this.templateRouteList = await this.scanTemplateRoutes();
		appLogger.debug('RouteRegistry initialized', this.templateRouteList);
	}

	async reload(): Promise<void> {
		await this.init();

		for (const listener of this.reloadListeners) {
			listener();
		}
	}

	onReload(listener: () => void): () => void {
		this.reloadListeners.add(listener);
		return () => {
			this.reloadListeners.delete(listener);
		};
	}

	matchRequest(requestUrl: string): RouteMatch | null {
		const url = new URL(requestUrl);
		const requestedPathname = normalizePathname(url.pathname);
		const query = this.getSearchParams(url);

		for (const route of this.templateRouteList) {
			if (route.kind !== 'exact') {
				continue;
			}

			if (requestedPathname === route.pathname || requestedPathname === `${route.pathname}/`) {
				return {
					requestedPathname,
					templateRoute: route,
					params: {},
					query,
				};
			}
		}

		for (const route of this.templateRouteList) {
			if (route.kind !== 'dynamic') {
				continue;
			}

			const params = this.tryExtractParams(route, requestedPathname);
			if (!params) {
				continue;
			}

			return {
				requestedPathname,
				templateRoute: route,
				params,
				query,
			};
		}

		for (const route of this.templateRouteList) {
			if (route.kind !== 'catch-all') {
				continue;
			}

			const params = this.tryExtractParams(route, requestedPathname);
			if (!params) {
				continue;
			}

			return {
				requestedPathname,
				templateRoute: route,
				params,
				query,
			};
		}

		return null;
	}

	async listStaticPathExpansions(input: { runtimeOrigin: string }): Promise<readonly StaticPathExpansion[]> {
		const expansions: StaticPathExpansion[] = [];

		for (const route of this.templateRouteList) {
			if (route.kind === 'exact') {
				continue;
			}

			const pageModule = await this.pageModuleAdapter.loadPageModule(route.filePath);
			const staticPaths = pageModule.staticPaths;

			if (this.buildMode) {
				invariant(staticPaths !== undefined, `[ecopages] Missing getStaticPaths in ${route.filePath}`);
				invariant(
					pageModule.staticProps !== undefined,
					`[ecopages] Missing getStaticProps in ${route.filePath}`,
				);
			}

			if (!staticPaths) {
				continue;
			}

			const result = await staticPaths({
				appConfig: this.appConfig,
				runtimeOrigin: input.runtimeOrigin,
			});

			for (const { params } of result.paths) {
				expansions.push({
					pathname: this.resolveTemplatePath(route.pathname, params),
					templateRoute: route,
					params,
				});
			}
		}

		return expansions;
	}

	async listStaticGenerationRoutes(input: { runtimeOrigin: string }): Promise<readonly StaticGenerationRoute[]> {
		const staticPathExpansions = await this.listStaticPathExpansions(input);

		return [
			...this.templateRouteList
				.filter((route) => route.kind === 'exact')
				.map((route) => ({
					requestUrl: `${input.runtimeOrigin}${route.pathname}`,
					pathname: route.pathname,
					templateRoute: route,
					params: {},
				})),
			...staticPathExpansions.map((route) => ({
				requestUrl: `${input.runtimeOrigin}${route.pathname}`,
				pathname: route.pathname,
				templateRoute: route.templateRoute,
				params: route.params,
			})),
		];
	}

	private async scanTemplateRoutes(): Promise<TemplateRoute[]> {
		if (!existsSync(this.pagesDir)) {
			return [];
		}

		const scannedFiles = await fileSystem.glob(
			this.templatesExt.map((ext) => `**/*${ext}`),
			{
				cwd: this.pagesDir,
			},
		);

		const templateRoutes: TemplateRoute[] = [];

		for await (const file of scannedFiles) {
			if (file.includes('.ecopages-node.')) {
				continue;
			}

			const routePathname = this.getRoutePath(file);
			const filePath = path.join(this.pagesDir, file);
			const kind = this.classifyRouteKind(filePath);

			templateRoutes.push({
				pathname: routePathname,
				kind,
				filePath,
				paramNames: this.getParamNames(routePathname),
			});
		}

		return templateRoutes.sort((left, right) => {
			const priorityDifference = ROUTE_PRIORITY[left.kind] - ROUTE_PRIORITY[right.kind];
			if (priorityDifference !== 0) {
				return priorityDifference;
			}

			if (left.pathname === '/') {
				return -1;
			}

			if (right.pathname === '/') {
				return 1;
			}

			return left.pathname.localeCompare(right.pathname);
		});
	}

	private getRoutePath(file: string): string {
		const cleanedRoute = this.templatesExt
			.reduce((route, ext) => route.replace(ext, ''), file)
			.replace(/\/?index$/, '');

		return normalizePathname(`/${cleanedRoute}`);
	}

	private classifyRouteKind(filePath: string): RouteKind {
		if (filePath.includes('[...')) {
			return 'catch-all';
		}

		if (filePath.includes('[') && filePath.includes(']')) {
			return 'dynamic';
		}

		return 'exact';
	}

	private getParamNames(routePathname: string): string[] {
		const matches = routePathname.match(/\[(?:\.\.\.)?([^\]]+)\]/g);
		return matches ? matches.map((match) => match.replace(/^\[(?:\.\.\.)?/, '').replace(/\]$/, '')) : [];
	}

	private tryExtractParams(route: TemplateRoute, requestedPathname: string): RouteParams | null {
		const routeParts = route.pathname.split('/');
		const pathnameParts = requestedPathname.split('/');

		if (route.kind === 'dynamic' && routeParts.length !== pathnameParts.length) {
			return null;
		}

		const params: RouteParams = {};

		for (let i = 0; i < routeParts.length; i++) {
			const routePart = routeParts[i];
			const pathnamePart = pathnameParts[i];

			if (!routePart) {
				continue;
			}

			if (routePart.startsWith('[...') && routePart.endsWith(']')) {
				const paramName = routePart.slice(4, -1);
				params[paramName] = pathnameParts.slice(i).filter(Boolean);
				return params;
			}

			if (routePart.startsWith('[') && routePart.endsWith(']')) {
				if (pathnamePart === undefined) {
					return null;
				}

				params[routePart.slice(1, -1)] = pathnamePart;
				continue;
			}

			if (routePart !== pathnamePart) {
				return null;
			}
		}

		if (route.kind === 'catch-all') {
			const cleanPathname = route.pathname.replace(/\[.*?\]/g, '');
			return requestedPathname.includes(cleanPathname) ? params : null;
		}

		return params;
	}

	private getSearchParams(url: URL): RouteQuery {
		const query: RouteQuery = {};

		for (const [key, value] of url.searchParams) {
			query[key] = value;
		}

		return query;
	}

	private resolveTemplatePath(pathname: string, params: RouteParams): string {
		let resolvedPath = pathname;

		for (const [key, value] of Object.entries(params)) {
			const serializedValue = Array.isArray(value) ? value.join('/') : value;
			resolvedPath = resolvedPath.replace(`[...${key}]`, serializedValue);
			resolvedPath = resolvedPath.replace(`[${key}]`, serializedValue);
		}

		return normalizePathname(resolvedPath);
	}
}

function normalizePathname(pathname: string): string {
	if (!pathname || pathname === '/') {
		return '/';
	}

	const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
	return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
