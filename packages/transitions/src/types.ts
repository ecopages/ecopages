/**
 * Types for the @ecopages/transitions package
 * @module
 */

/**
 * Configuration options for the EcoRouter
 */
export interface EcoRouterOptions {
	/**
	 * Selector for links to intercept.
	 * @default 'a[href]'
	 */
	linkSelector?: string;

	/**
	 * Attribute to mark elements for persistence across navigations.
	 * @default 'data-eco-persist'
	 */
	persistAttribute?: string;

	/**
	 * Attribute to force full page reload.
	 * @default 'data-eco-reload'
	 */
	reloadAttribute?: string;

	/**
	 * Whether to update the browser history on navigation.
	 * @default true
	 */
	updateHistory?: boolean;
}

/**
 * Events emitted during the navigation lifecycle
 */
export interface EcoNavigationEvent {
	/**
	 * The URL being navigated to
	 */
	url: URL;

	/**
	 * The direction of navigation
	 */
	direction: 'forward' | 'back' | 'replace';
}

/**
 * Event fired before the DOM swap occurs
 */
export interface EcoBeforeSwapEvent extends EcoNavigationEvent {
	/**
	 * The new document to swap in
	 */
	newDocument: Document;

	/**
	 * Cancel the navigation and do a full page reload instead
	 */
	reload: () => void;
}

/**
 * Event fired after the DOM swap completes
 */
export interface EcoAfterSwapEvent extends EcoNavigationEvent {
	/**
	 * Elements that were persisted during the swap
	 */
	persistedElements: Map<string, Element>;
}

/**
 * Custom event map for navigation lifecycle
 */
export interface EcoRouterEventMap {
	'eco:before-swap': CustomEvent<EcoBeforeSwapEvent>;
	'eco:after-swap': CustomEvent<EcoAfterSwapEvent>;
	'eco:page-load': CustomEvent<EcoNavigationEvent>;
}
