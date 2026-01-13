/**
 * Manages scroll position during navigations
 * @module
 */

import type { EcoRouterOptions } from './types';

/**
 * Service for handling scroll position during page transitions.
 * Handles window scroll behavior and hash navigation.
 */
/**
 * Handle window scroll position based on scrollBehavior option.
 * Hash links always scroll to target regardless of option.
 */
export function manageScroll(
	newUrl: URL,
	previousUrl: URL,
	options: {
		scrollBehavior: Required<EcoRouterOptions>['scrollBehavior'];
		smoothScroll: boolean;
	},
): void {
	const { scrollBehavior, smoothScroll } = options;

	if (newUrl.hash) {
		const target = document.getElementById(newUrl.hash.slice(1));
		target?.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'instant' });
		return;
	}

	const behavior = smoothScroll ? 'smooth' : 'instant';

	switch (scrollBehavior) {
		case 'preserve':
			break;
		case 'auto':
			if (newUrl.pathname !== previousUrl.pathname) {
				window.scrollTo({ top: 0, left: 0, behavior });
			}
			break;
		case 'top':
		default:
			window.scrollTo({ top: 0, left: 0, behavior });
			break;
	}
}
