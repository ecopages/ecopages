/**
 * Configuration options for the EcoRouter
 */
export interface EcoRouterOptions {
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

export const DEFAULT_OPTIONS: Required<EcoRouterOptions> = {
	linkSelector: 'a[href]',
	reloadAttribute: 'data-eco-reload',
	debug: false,
};
