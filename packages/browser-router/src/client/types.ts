/**
 * Shared types for the EcoPages transitions package
 * @module
 */

/**
 * Configuration options for the EcoRouter
 */
export interface EcoRouterOptions {
	/** Selector for links to intercept. @default 'a[href]' */
	linkSelector?: string;
	/** Attribute to mark elements for DOM persistence. @default 'data-eco-persist' */
	persistAttribute?: string;
	/** Attribute to force full page reload. @default 'data-eco-reload' */
	reloadAttribute?: string;
	/** Attribute to mark elements for scroll position persistence. @default 'data-eco-scroll-persist' */
	scrollPersistAttribute?: string;
	/** Whether to update browser history. @default true */
	updateHistory?: boolean;
	/**
	 * Scroll behavior after navigation:
	 * - 'top': Always scroll to top (default)
	 * - 'preserve': Keep current scroll position
	 * - 'auto': Scroll to top only when pathname changes
	 */
	scrollBehavior?: 'top' | 'preserve' | 'auto';
	/**
	 * Whether to use the View Transition API for animations.
	 * Falls back to instant swap if not supported.
	 * @default true
	 */
	viewTransitions?: boolean;
	/**
	 * Whether to use smooth scrolling during navigation.
	 * If true, uses 'smooth' behavior. If false, uses 'instant' behavior.
	 * @default false
	 */
	smoothScroll?: boolean;
}

/** Events emitted during the navigation lifecycle */
export interface EcoNavigationEvent {
	url: URL;
	direction: 'forward' | 'back' | 'replace';
}

/** Event fired before the DOM swap occurs */
export interface EcoBeforeSwapEvent extends EcoNavigationEvent {
	newDocument: Document;
	reload: () => void;
}

/** Event fired after the DOM swap completes */
export interface EcoAfterSwapEvent extends EcoNavigationEvent {
	persistedElements: Map<string, Element>;
}

/** Default configuration options */
export const DEFAULT_OPTIONS: Required<EcoRouterOptions> = {
	linkSelector: 'a[href]',
	persistAttribute: 'data-eco-persist',
	reloadAttribute: 'data-eco-reload',
	scrollPersistAttribute: 'data-eco-scroll-persist',
	updateHistory: true,
	scrollBehavior: 'top',
	viewTransitions: false,
	smoothScroll: false,
};
