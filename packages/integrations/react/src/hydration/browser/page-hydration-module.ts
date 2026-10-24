/**
 * Returns the Page component of a loaded Page module, attaching an MDX module's config to it.
 */
export function resolvePageComponent(
	module: Record<string, unknown>,
	isMdx: boolean,
	normalizePageConfig?: (config: unknown) => void,
): unknown {
	const Page = module.default ?? module;
	if (isMdx && module.config && Page && typeof Page === 'function') {
		Object.assign(Page, { config: module.config });
		normalizePageConfig?.(module.config);
	}
	return Page;
}
