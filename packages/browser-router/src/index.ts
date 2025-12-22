/**
 * @ecopages/browser-router
 * Client-side navigation and view transitions for Ecopages
 * @module
 */

export type {
	EcoRouterOptions,
	EcoNavigationEvent,
	EcoBeforeSwapEvent,
	EcoAfterSwapEvent,
	EcoRouterEventMap,
} from './types';

export { DEFAULT_OPTIONS } from './types';

export { EcoRouter, createRouter } from './client/eco-router';

export { DomSwapper, PersistenceManager, ScrollManager, ViewTransitionManager } from './client/services';
