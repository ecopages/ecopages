/**
 * Shared types for the EcoPages transitions package
 * @module
 */

/**
 * Prefetch configuration options.
 */
export interface PrefetchConfig {
	/**
	 * Prefetching strategy:
	 * - 'viewport': Prefetch when links enter viewport
	 * - 'hover': Prefetch on hover/focus intent
	 * - 'intent': Viewport + prioritize hover (recommended)
	 * @default 'intent'
	 */
	strategy?: 'viewport' | 'hover' | 'intent';

	/**
	 * Hover intent delay in ms before triggering prefetch.
	 * @default 65
	 */
	delay?: number;

	/**
	 * Attribute to disable prefetch on specific links.
	 * @default 'data-eco-no-prefetch'
	 */
	noPrefetchAttribute?: string;

	/**
	 * Respect navigator.connection.saveData and slow connections.
	 * @default true
	 */
	respectDataSaver?: boolean;
}

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
	/**
	 * Prefetch configuration. Set to false to disable prefetching entirely.
	 * @default { strategy: 'intent', delay: 65, noPrefetchAttribute: 'data-eco-no-prefetch', respectDataSaver: true }
	 */
	prefetch?: PrefetchConfig | false;
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
export interface EcoAfterSwapEvent extends EcoNavigationEvent {}

/** Default prefetch configuration */
const DEFAULT_PREFETCH_CONFIG: Required<PrefetchConfig> = {
	strategy: 'intent',
	delay: 65,
	noPrefetchAttribute: 'data-eco-no-prefetch',
	respectDataSaver: true,
};

/** Default configuration options */
export const DEFAULT_OPTIONS: Required<EcoRouterOptions> = {
	linkSelector: 'a[href]',
	persistAttribute: 'data-eco-persist',
	reloadAttribute: 'data-eco-reload',
	updateHistory: true,
	scrollBehavior: 'top',
	viewTransitions: true,
	smoothScroll: false,
	prefetch: DEFAULT_PREFETCH_CONFIG,
};
