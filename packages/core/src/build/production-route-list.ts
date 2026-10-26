import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { RouteKind, RouteRole, TemplateRoute } from '../router/server/route-registry.ts';
import { toRootRelativePath } from '../utils/root-relative-path.ts';
import { ensureProductionBuildId } from './production-build-id.ts';
import { SERVER_BUNDLE_DIR } from '../utils/resolve-entry-file.ts';
import { getServerBundleOutputPaths } from './server-bundle-deploy-manifest.ts';

export const PRODUCTION_ROUTES_FILENAME = 'routes.json';

type SerializedTemplateRoute = {
	pathname: string;
	kind: RouteKind;
	role: RouteRole;
	filePath: string;
	paramNames: string[];
};

export type ProductionRouteList = {
	buildId: string;
	routes: SerializedTemplateRoute[];
};

export function getProductionRouteListPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getServerBundleOutputPaths(appConfig).serverOutdir, PRODUCTION_ROUTES_FILENAME);
}

function getProductionRouteListPathFromDist(rootDir: string, distDir: string): string {
	return path.join(path.resolve(rootDir, distDir), SERVER_BUNDLE_DIR, PRODUCTION_ROUTES_FILENAME);
}

/**
 * Writes the filesystem route list `ecopages start` loads instead of scanning sources.
 */
export function writeProductionRouteList(appConfig: EcoPagesAppConfig, routes: readonly TemplateRoute[]): void {
	const payload: ProductionRouteList = {
		buildId: ensureProductionBuildId(appConfig),
		routes: routes.map((route) => ({
			pathname: route.pathname,
			kind: route.kind,
			role: route.role,
			filePath: toRootRelativePath(appConfig.rootDir, route.filePath),
			paramNames: [...(route.paramNames ?? [])],
		})),
	};
	const listPath = getProductionRouteListPath(appConfig);
	fileSystem.ensureDir(path.dirname(listPath));
	fileSystem.write(listPath, `${JSON.stringify(payload, null, '\t')}\n`);
}

function parseProductionRouteList(raw: string): ProductionRouteList | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('buildId' in parsed) ||
			!('routes' in parsed) ||
			typeof parsed.buildId !== 'string' ||
			!Array.isArray(parsed.routes)
		) {
			return undefined;
		}
		return parsed as ProductionRouteList;
	} catch {
		return undefined;
	}
}

export function readProductionRouteList(appConfig: EcoPagesAppConfig): ProductionRouteList | undefined {
	const listPath = getProductionRouteListPath(appConfig);
	if (!fileSystem.exists(listPath)) {
		return undefined;
	}
	return parseProductionRouteList(fileSystem.readFileSync(listPath));
}

export function readProductionRouteListFromDist(rootDir: string, distDir: string): ProductionRouteList | undefined {
	const listPath = getProductionRouteListPathFromDist(rootDir, distDir);
	if (!fileSystem.exists(listPath)) {
		return undefined;
	}
	return parseProductionRouteList(fileSystem.readFileSync(listPath));
}

/**
 * Restores template routes from `dist/.server/routes.json`, resolving file paths against `rootDir`.
 */
export function loadProductionTemplateRoutes(appConfig: EcoPagesAppConfig): TemplateRoute[] | undefined {
	const list = readProductionRouteList(appConfig);
	if (!list) {
		return undefined;
	}
	return list.routes.map((route) => ({
		pathname: route.pathname,
		kind: route.kind,
		role: route.role,
		filePath: path.resolve(appConfig.rootDir, route.filePath),
		paramNames: route.paramNames,
	}));
}
