/**
 * Types for the @ecopages/browser-router package
 * @module
 */

import type { EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './client/types';

export type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './client/types';

export { DEFAULT_OPTIONS } from './client/types';

/**
 * Custom event map for navigation lifecycle
 */
export interface EcoRouterEventMap {
	'eco:before-swap': CustomEvent<EcoBeforeSwapEvent>;
	'eco:after-swap': CustomEvent<EcoAfterSwapEvent>;
	'eco:page-load': CustomEvent<EcoNavigationEvent>;
}
