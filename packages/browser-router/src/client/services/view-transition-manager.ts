/**
 * Manages View Transition API integration
 * @module
 */

import { applyViewTransitionNames, clearViewTransitionNames } from '../view-transition-utils.ts';

/**
 * Service for handling View Transition API during page transitions.
 * Falls back to direct execution if the API is not supported.
 */
export class ViewTransitionManager {
	private enabled: boolean;

	constructor(enabled: boolean) {
		this.enabled = enabled;
	}

	/**
	 * Check if the View Transition API is supported
	 */
	isSupported(): boolean {
		return 'startViewTransition' in document;
	}

	/**
	 * Execute a callback with view transition if available and enabled.
	 * Falls back to direct execution if not supported.
	 * @param callback - The DOM update callback to execute
	 * @returns Promise that resolves when the transition completes
	 */
	async transition(callback: () => void | Promise<void>): Promise<void> {
		if (!this.enabled || !this.isSupported()) {
			await callback();
			return;
		}

		/**
		 * Apply view transition names to current elements before starting the transition.
		 * This ensures the "old" state is captured correctly.
		 */
		applyViewTransitionNames();

		const transition = (
			document as Document & { startViewTransition: (cb: () => void) => ViewTransition }
		).startViewTransition(async () => {
			await callback();
			/**
			 * Apply names to the NEW elements after DOM swap and hydration.
			 * This ensures the "new" state is captured correctly.
			 */
			applyViewTransitionNames();
		});

		try {
			await transition.finished;
		} finally {
			/**
			 * Cleanup view transition names and dynamic styles after transition completes.
			 * This prevents style pollution.
			 */
			clearViewTransitionNames();
		}
	}
}

/**
 * ViewTransition interface for browsers that support the API
 */
interface ViewTransition {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
	skipTransition(): void;
}
