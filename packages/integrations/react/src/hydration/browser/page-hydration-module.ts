export type PageModule = {
	Page: unknown;
	preload?: (props: Record<string, unknown>) => void | Promise<void>;
};

function isPagePreload(value: unknown): value is NonNullable<PageModule['preload']> {
	return typeof value === 'function';
}

/**
 * Normalizes a loaded Page module into the shape used by hydration and HMR.
 */
export function resolvePageModule(
	module: Record<string, unknown>,
	isMdx: boolean,
	normalizePageConfig?: (config: unknown) => void,
): PageModule {
	const Page = module.default ?? module;
	if (isMdx && module.config && Page && typeof Page === 'function') {
		Object.assign(Page, { config: module.config });
		normalizePageConfig?.(module.config);
	}
	return {
		Page,
		preload: isPagePreload(module.preload) ? module.preload : undefined,
	};
}
