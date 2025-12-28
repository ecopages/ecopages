/**
 * Manages scroll position during navigations
 * @module
 */

import type { EcoRouterOptions } from '../types';

/**
 * Service for handling scroll position during page transitions.
 * Handles window scroll behavior and hash navigation.
 */
export class ScrollManager {
	private scrollBehavior: Required<EcoRouterOptions>['scrollBehavior'];
	private smoothScroll: boolean;

	constructor(scrollBehavior: Required<EcoRouterOptions>['scrollBehavior'], smoothScroll: boolean) {
		this.scrollBehavior = scrollBehavior;
		this.smoothScroll = smoothScroll;
	}

	/**
	 * Handle window scroll position based on scrollBehavior option.
	 * Hash links always scroll to target regardless of option.
	 */
	handleScroll(newUrl: URL, previousUrl: URL): void {
		if (newUrl.hash) {
			const target = document.querySelector(newUrl.hash);
			target?.scrollIntoView({ behavior: this.smoothScroll ? 'smooth' : 'instant' });
			return;
		}

		const behavior = this.smoothScroll ? 'smooth' : 'instant';

		switch (this.scrollBehavior) {
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
}
