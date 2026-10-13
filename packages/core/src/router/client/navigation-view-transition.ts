import {
	applyViewTransitionNames,
	clearViewTransitionNames,
	ensureRootViewTransitionStyles,
	navigationHasNamedViewTransitions,
} from '../../client/view-transitions.ts';

export type NavigationViewTransitionOptions = {
	enabled: boolean;
	incomingDocument?: Document;
};

type NavigationViewTransition = {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
};

/** Wraps a router-provided page swap in the shared named-view-transition lifecycle. */
export async function runNavigationViewTransition(
	update: () => void | Promise<void>,
	options: NavigationViewTransitionOptions,
): Promise<void> {
	const incomingDocument = options.incomingDocument ?? document;
	if (!options.enabled) {
		await update();
		return;
	}

	ensureRootViewTransitionStyles();
	if (
		typeof document.startViewTransition !== 'function' ||
		!navigationHasNamedViewTransitions(document, incomingDocument)
	) {
		await update();
		return;
	}

	applyViewTransitionNames();
	const transition = document.startViewTransition(async () => {
		await update();
		applyViewTransitionNames();
	}) as NavigationViewTransition;

	void transition.ready.catch(logViewTransitionError);
	void transition.finished.catch(logViewTransitionError).finally(() => clearViewTransitionNames());

	await transition.updateCallbackDone;
}

function logViewTransitionError(error: unknown): void {
	if (error instanceof Error && error.name === 'AbortError') return;
	console.error('[ecopages] View transition lifecycle failed:', error);
}
