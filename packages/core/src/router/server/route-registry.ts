import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { PageParams, PageQuery } from '../../types/contracts.ts';
import { invariant } from '../../utils/invariant.ts';
import { normalizePathname } from '../../utils/path-pattern.ts';
import { parseSearchParams } from './parse-search-params.ts';
import { findIntegrationForFile, findLongestExtension } from '../../plugins/find-integration-for-file.ts';
import {
	buildSegmentPath,
	matchParsedSegmentPath,
	parseSegmentPath,
	type ParsedSegmentPath,
} from './segment-path-matcher.ts';

export type RouteKind = 'exact' | 'catch-all' | 'dynamic';
export type RouteParams = PageParams;
export type RouteQuery = PageQuery;

export type TemplateRoute = {
	readonly pathname: string;
	readonly kind: RouteKind;
	readonly filePath: string;
	readonly paramNames: readonly string[];
};

export type RouteMatch = {
	readonly requestedPathname: string;
	readonly templateRoute: Pick<TemplateRoute, 'pathname' | 'kind' | 'filePath'> &
		Partial<Pick<TemplateRoute, 'paramNames'>>;
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
	private readonly fallbackOrigin: string;
	readonly appConfig: EcoPagesAppConfig;
	readonly pagesDir: string;
	readonly templatesExt: readonly string[];
	readonly buildMode: boolean;
	private readonly pageModuleAdapter: RouteRegistryPageModuleAdapter;
	private templateRouteList: TemplateRoute[] = [];
	private readonly reloadListeners = new Set<() => void>();

	constructor(options: RouteRegistryOptions) {
		this.fallbackOrigin = options.origin;
		this.appConfig = options.appConfig;
		this.pagesDir = options.pagesDir;
		this.templatesExt = options.templatesExt;
		this.buildMode = options.buildMode;
		this.pageModuleAdapter = options.pageModuleAdapter;
	}

	get origin(): string {
		return this.appConfig.appRuntime?.origin ?? this.fallbackOrigin;
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

	matchRequest(requestUrl: string, parsedPathSegments?: ParsedSegmentPath): RouteMatch | null {
		const url = new URL(requestUrl);
		const requestedPathname = normalizePathname(url.pathname);
		const pathSegments = parsedPathSegments ?? parseSegmentPath(requestedPathname);
		const query = this.getSearchParams(url);

		for (const route of this.templateRouteList) {
			const params = matchParsedSegmentPath(route.pathname, pathSegments, 'filesystem');
			if (params) {
				return {
					requestedPathname,
					templateRoute: route,
					params,
					query,
				};
			}
		}

		return null;
	}

	/**
	 * Orders overlapping catch-all routes by the specificity of their prefix.
	 *
	 * @remarks
	 * Prefix segments are compared from left to right because an earlier static
	 * segment constrains a request more strongly than a later one. A longer
	 * prefix wins only after the shared segment pattern ties. The pathname tie
	 * breaker keeps equal patterns deterministic without depending on discovery
	 * order.
	 */
	private compareCatchAllSpecificity(left: TemplateRoute, right: TemplateRoute): number {
		const leftPrefix = this.getCatchAllPrefix(left.pathname);
		const rightPrefix = this.getCatchAllPrefix(right.pathname);
		const sharedLength = Math.min(leftPrefix.length, rightPrefix.length);

		for (let index = 0; index < sharedLength; index += 1) {
			const leftIsDynamic = this.isDynamicRouteSegment(leftPrefix[index]);
			const rightIsDynamic = this.isDynamicRouteSegment(rightPrefix[index]);
			if (leftIsDynamic !== rightIsDynamic) {
				return leftIsDynamic ? 1 : -1;
			}
		}

		const prefixLengthDifference = rightPrefix.length - leftPrefix.length;
		return prefixLengthDifference !== 0 ? prefixLengthDifference : left.pathname.localeCompare(right.pathname);
	}

	private getCatchAllPrefix(pathname: string): string[] {
		const segments = pathname.split('/').filter(Boolean);
		const catchAllIndex = segments.findIndex((segment) => segment.startsWith('[...') && segment.endsWith(']'));
		return catchAllIndex === -1 ? segments : segments.slice(0, catchAllIndex);
	}

	private isDynamicRouteSegment(segment: string): boolean {
		return segment.startsWith('[') && segment.endsWith(']');
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
					pathname: buildSegmentPath(route.pathname, params, 'filesystem'),
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
		if (!fileSystem.exists(this.pagesDir)) {
			return [];
		}

		const scannedFiles = await fileSystem.glob(
			this.templatesExt.map((ext) => `**/*${ext}`),
			{
				cwd: this.pagesDir,
			},
		);

		const templateRoutes: TemplateRoute[] = [];
		const routeFiles = new Map<string, string>();

		for await (const file of scannedFiles) {
			if (file.includes('.ecopages-node.')) {
				continue;
			}

			const routePathname = this.getRoutePath(file);
			const filePath = path.join(this.pagesDir, file);
			const kind = this.classifyRouteKind(file);

			const duplicateFile = routeFiles.get(routePathname);
			if (duplicateFile === filePath) {
				continue;
			}
			invariant(
				duplicateFile === undefined,
				`${duplicateFile} and ${filePath} both define the route "${routePathname}". Keep one of them.`,
			);
			routeFiles.set(routePathname, filePath);
			const owner = kind === 'exact' ? undefined : findIntegrationForFile(this.appConfig.integrations, filePath);
			invariant(
				owner?.acceptsParams !== false,
				`${filePath}: ${findLongestExtension(owner?.extensions ?? [], filePath)} Pages cannot receive Params, so they cannot use dynamic route segments. Rename the file, or use an eco.page() Page from an Integration that supports staticPaths.`,
			);

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

			if (left.kind === 'catch-all' && right.kind === 'catch-all') {
				return this.compareCatchAllSpecificity(left, right);
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

	/**
	 * @remarks
	 * Strips the longest template extension the file ends with, so `about.kita.tsx` keeps no
	 * `.kita` part when `.tsx` is also registered, and `my.html-tips.html` keeps its name.
	 */
	private getRoutePath(file: string): string {
		const extension = findLongestExtension(this.templatesExt, file) ?? '';
		const cleanedRoute = file.slice(0, file.length - extension.length).replace(/\/?index$/, '');

		return normalizePathname(`/${cleanedRoute}`);
	}

	/**
	 * @param file - Path relative to the pages directory, so brackets in the project path do not
	 * make every route dynamic.
	 */
	private classifyRouteKind(file: string): RouteKind {
		if (file.includes('[...')) {
			return 'catch-all';
		}

		if (file.includes('[') && file.includes(']')) {
			return 'dynamic';
		}

		return 'exact';
	}

	private getParamNames(routePathname: string): string[] {
		const matches = routePathname.match(/\[(?:\.\.\.)?([^\]]+)\]/g);
		return matches ? matches.map((match) => match.replace(/^\[(?:\.\.\.)?/, '').replace(/\]$/, '')) : [];
	}

	private getSearchParams(url: URL): RouteQuery {
		return parseSearchParams(url.searchParams);
	}
}
