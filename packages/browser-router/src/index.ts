/**
 * @ecopages/browser-router
 * Client-side navigation and view transitions for Ecopages
 * @module
 */

export {
	createRouter,
	DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC,
	DEFAULT_OPTIONS,
	EcoRouter,
	syncDocumentElementAttributes,
	type BrowserRouterNavigateOptions,
	type EcoRouterOptions,
} from './client/index.ts';

export { DomSwapper } from './client/dom/dom-swapper.ts';
export { ViewTransitionManager } from './client/services/view-transition-manager.ts';
