import {
	isDevTransformModuleUrl,
	isHmrDiskModuleUrl,
	stripModuleUrlQuery,
	withModuleCacheBust,
} from '../hmr-asset-paths.ts';

export type HmrModuleHandlers = Record<string, (url: string) => Promise<void> | void>;

export type ApplyModuleUpdateContext = {
	getHandlers: () => HmrModuleHandlers | undefined;
	reloadCurrentPage: (request: { clearCache: boolean; moduleUrl: string }) => Promise<boolean>;
	importModule: (url: string) => Promise<unknown>;
	waitForSettled: () => Promise<void>;
};

/**
 * Resolves the module URL that should drive a layout refresh after HMR.
 *
 * @remarks
 * Dev transform page modules take precedence over legacy `_hmr` disk URLs and any
 * non-page handler registered for script widgets.
 */
export function resolveActiveModuleUrl(handlers: HmrModuleHandlers, pageModule?: string): string | undefined {
	if (pageModule) {
		const basePath = stripModuleUrlQuery(pageModule);
		if (isDevTransformModuleUrl(basePath) || isHmrDiskModuleUrl(basePath)) {
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
 * Applies one module update using integration handlers or router-coordinated reload.
 *
 * @remarks
 * Dev transform modules never fall back to bare dynamic import. They rely on
 * hydration-registered handlers or `reloadCurrentPage` with the refreshed URL.
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

	const handler = handlers?.[basePath];
	if (handler) {
		await handler(url);
		return;
	}

	if (isDevTransformModuleUrl(basePath)) {
		await context.reloadCurrentPage({ clearCache: false, moduleUrl: url });
		return;
	}

	try {
		await context.importModule(url);
		await context.reloadCurrentPage({ clearCache: false, moduleUrl: url });
	} catch (error) {
		console.error('[ecopages] Failed to apply HMR update:', error);
	}
}
