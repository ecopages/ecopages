import { isDevTransformModuleUrl, stripModuleUrlQuery, withModuleCacheBust } from '../hmr-asset-paths.ts';

export type HmrModuleHandlers = Record<string, (url: string) => Promise<void> | void>;

export type ApplyModuleUpdateContext = {
	getHandlers: () => HmrModuleHandlers | undefined;
	getActivePageModule?: () => string | undefined;
	reloadCurrentPage: (request: { clearCache: boolean; moduleUrl: string }) => Promise<boolean>;
	importModule: (url: string) => Promise<unknown>;
	waitForSettled: () => Promise<void>;
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
		const activePageModule = context.getActivePageModule?.();
		const isActivePageModule = activePageModule !== undefined && stripModuleUrlQuery(activePageModule) === basePath;

		if (isActivePageModule) {
			await context.reloadCurrentPage({ clearCache: false, moduleUrl: url });
			return;
		}

		await context.importModule(url);
		return;
	}

	console.warn(`[ecopages] No HMR handler for module update: ${basePath}`);
}
