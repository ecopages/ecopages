function isReactPageAssetName(src: string): boolean {
	return src.includes('ecopages-react-') && src.endsWith('.js');
}

/**
 * Returns whether a script URL belongs to a router-managed React page bootstrap asset.
 */
export function isReactRouterPageBootstrapAssetSrc(src: string): boolean {
	return isReactPageAssetName(src) && !src.includes('ecopages-react-island-');
}

/**
 * Returns whether a script URL follows the legacy React hydration asset naming pattern.
 */
export function isReactHydrationAssetSrc(src: string): boolean {
	return isReactPageAssetName(src) && src.includes('hydration.js');
}

/**
 * Returns whether a script URL should be treated as the page module source during router navigation.
 */
export function isReactPageHydrationAssetSrc(src: string): boolean {
	return isReactRouterPageBootstrapAssetSrc(src);
}
