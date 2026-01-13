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
	 * Whether to use the View Transitions API for page animations.
	 * When enabled and supported, page transitions animate using CSS view-transition pseudo-elements.
	 * Falls back to instant swap if not supported by the browser.
	 * @default true
	 */
	viewTransitions?: boolean;

	/**
	 * Enable debug logging to console
	 * @default false
	 */
	debug?: boolean;

	/**
	 * Scroll behavior after navigation:
	 * - 'top': Always scroll to top (default)
	 * - 'preserve': Keep current scroll position
	 * - 'auto': Scroll to top only when pathname changes
	 */
	scrollBehavior?: 'top' | 'preserve' | 'auto';

	/**
	 * Whether to use smooth scrolling during navigation.
	 * If true, uses 'smooth' behavior. If false, uses 'instant' behavior.
	 * @default false
	 */
	smoothScroll?: boolean;
}

export const DEFAULT_OPTIONS: Required<EcoRouterOptions> = {
	linkSelector: 'a[href]',
	reloadAttribute: 'data-eco-reload',
	viewTransitions: true,
	debug: false,
	scrollBehavior: 'top',
	smoothScroll: false,
};
