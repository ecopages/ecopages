/**
 * Manages View Transition API integration
 * @module
 */

type ViewTransitionDocument = Document & {
	startViewTransition: (callback: () => void | Promise<void>) => {
		finished: Promise<void>;
		ready: Promise<void>;
		updateCallbackDone: Promise<void>;
		skipTransition(): void;
	};
};

function isViewTransitionSupported(): boolean {
	return 'startViewTransition' in document;
}

export async function withViewTransition(callback: () => void): Promise<void> {
	if (!isViewTransitionSupported()) {
		callback();
		return;
	}

	const transition = (document as ViewTransitionDocument).startViewTransition(() => {
		callback();
	});

	await transition.finished;
}
