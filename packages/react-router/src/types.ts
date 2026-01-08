/**
 * Configuration options for the EcoReactRouter
 */
export interface EcoReactRouterOptions {
	/**
	 * CSS selector for links to intercept
	 * @default 'a[href]'
	 */
	linkSelector?: string;

	/**
	 * Attribute that forces a full page reload when present on a link
	 * @default 'data-eco-reload'
	 */
	reloadAttribute?: string;

	/**
	 * Enable debug logging to console
	 * @default false
	 */
	debug?: boolean;
}

export const DEFAULT_OPTIONS: Required<EcoReactRouterOptions> = {
	linkSelector: 'a[href]',
	reloadAttribute: 'data-eco-reload',
	debug: false,
};
