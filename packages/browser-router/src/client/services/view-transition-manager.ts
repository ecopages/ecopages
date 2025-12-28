/**
 * Manages View Transition API integration
 * @module
 */

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

		const transition = (
			document as Document & { startViewTransition: (cb: () => void) => ViewTransition }
		).startViewTransition(async () => {
			await callback();
		});

		await transition.finished;
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
