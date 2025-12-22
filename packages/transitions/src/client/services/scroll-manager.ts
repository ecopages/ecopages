/**
 * Manages scroll position during navigations
 * @module
 */

import type { EcoRouterOptions } from '../types';

/**
 * Service for handling scroll position during page transitions
 */
export class ScrollManager {
	private scrollPersistAttribute: string;
	private scrollBehavior: Required<EcoRouterOptions>['scrollBehavior'];

	constructor(scrollPersistAttribute: string, scrollBehavior: Required<EcoRouterOptions>['scrollBehavior']) {
		this.scrollPersistAttribute = scrollPersistAttribute;
		this.scrollBehavior = scrollBehavior;
	}

	/**
	 * Save scroll positions of elements marked with scrollPersistAttribute
	 * @returns Map of element IDs to their scrollTop values
	 */
	saveScrollPositions(): Map<string, number> {
		const positions = new Map<string, number>();
		const selector = `[${this.scrollPersistAttribute}]`;

		for (const element of document.querySelectorAll(selector)) {
			const id = element.getAttribute(this.scrollPersistAttribute);
			if (id) {
				positions.set(id, element.scrollTop);
			}
		}

		return positions;
	}

	/**
	 * Restore scroll positions to elements marked with scrollPersistAttribute
	 * @param positions - Map of element IDs to scrollTop values
	 */
	restoreScrollPositions(positions: Map<string, number>): void {
		for (const [id, scrollTop] of positions) {
			const element = document.querySelector(`[${this.scrollPersistAttribute}="${id}"]`);
			if (element) {
				element.scrollTop = scrollTop;
			}
		}
	}

	/**
	 * Handle window scroll position based on scrollBehavior option.
	 * Hash links always scroll to target regardless of option.
	 */
	handleScroll(newUrl: URL, previousUrl: URL): void {
		if (newUrl.hash) {
			const target = document.querySelector(newUrl.hash);
			target?.scrollIntoView();
			return;
		}

		switch (this.scrollBehavior) {
			case 'preserve':
				break;
			case 'auto':
				if (newUrl.pathname !== previousUrl.pathname) {
					window.scrollTo(0, 0);
				}
				break;
			case 'top':
			default:
				window.scrollTo(0, 0);
				break;
		}
	}
}
