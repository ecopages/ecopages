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
} from './client/types.ts';

export { DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC, DEFAULT_OPTIONS } from './client/types.ts';
export {
	defaultDocumentElementAttributesToSync,
	syncDocumentElementAttributes,
} from './client/document-element-sync.ts';

export { EcoRouter, createRouter } from './client/index.ts';

export { DomSwapper, ViewTransitionManager } from './client/services/index.ts';
