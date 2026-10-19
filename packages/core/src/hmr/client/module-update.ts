import { isDevTransformModuleUrl, stripModuleUrlQuery, withModuleCacheBust } from '../hmr-asset-paths.ts';

export type HmrModuleHandlers = Record<string, (url: string) => Promise<void> | void>;

export type ApplyModuleUpdateContext = {
	getHandlers: () => HmrModuleHandlers | undefined;
	getActivePageModule?: () => string | undefined;
	reloadCurrentPage: (request: { clearCache: boolean; moduleUrl: string }) => Promise<boolean>;
	importModule: (url: string) => Promise<unknown>;
	waitForSettled: () => Promise<void>;
	reloadPage: () => Promise<void>;
};

export function resolveActiveModuleUrl(handlers: HmrModuleHandlers, pageModule?: string): string | undefined {
	if (pageModule) {
		const basePath = stripModuleUrlQuery(pageModule);
		if (isDevTransformModuleUrl(basePath)) {
			return basePath;
		}
	}

	const handlerPaths = Object.keys(handlers);
	for (let index = handlerPaths.length - 1; index >= 0; index -= 1) {
		const handlerPath = handlerPaths[index]!;
		if (isDevTransformModuleUrl(handlerPath)) {
			return handlerPath;
		}
	}

	return handlerPaths[handlerPaths.length - 1];
}

/**
 * @remarks
 * A hot update that cannot be applied leaves the page running stale modules, so every failure path ends in
 * `reloadPage`: a handler or import that throws, an active page module the navigation owner does not reload, and a
 * module without a handler. Thrown errors are still logged.
 */
export async function applyModuleUpdate(
	path: string,
	context: ApplyModuleUpdateContext,
	timestamp?: number,
): Promise<void> {
	const basePath = stripModuleUrlQuery(path);
	const url = withModuleCacheBust(basePath, timestamp);
	const handlers = context.getHandlers();

	await context.waitForSettled();

	try {
		if (await applyHotUpdate(basePath, url, handlers, context)) {
			return;
		}
	} catch (error) {
		console.error(`[ecopages] HMR update failed for ${basePath}:`, error);
	}

	await context.reloadPage();
}

async function applyHotUpdate(
	basePath: string,
	url: string,
	handlers: HmrModuleHandlers | undefined,
	context: ApplyModuleUpdateContext,
): Promise<boolean> {
	const handler = handlers?.[basePath];
	if (handler) {
		await handler(url);
		return true;
	}

	if (isDevTransformModuleUrl(basePath)) {
		const activePageModule = context.getActivePageModule?.();
		const isActivePageModule = activePageModule !== undefined && stripModuleUrlQuery(activePageModule) === basePath;

		if (isActivePageModule) {
			return context.reloadCurrentPage({ clearCache: false, moduleUrl: url });
		}

		await context.importModule(url);
		return true;
	}

	console.warn(`[ecopages] No HMR handler for module update: ${basePath}`);
	return false;
}
