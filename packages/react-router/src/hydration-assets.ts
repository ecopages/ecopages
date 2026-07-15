function isReactPageAssetName(src: string): boolean {
	return src.includes('ecopages-react-') && src.endsWith('.js');
}

/**
 * Returns whether a script URL belongs to a router-managed React page bootstrap asset.
 */
export function isReactRouterPageBootstrapAssetSrc(src: string): boolean {
	return isReactPageAssetName(src) && !src.includes('ecopages-react-island-');
}
