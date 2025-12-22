/**
 * @ecopages/transitions
 * Client-side navigation and view transitions for Ecopages
 * @module
 */

export type {
	EcoRouterOptions,
	EcoNavigationEvent,
	EcoBeforeSwapEvent,
	EcoAfterSwapEvent,
	EcoRouterEventMap,
} from './types.ts';

export { EcoRouter, createRouter } from './client/eco-router.ts';
