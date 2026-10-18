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

/**
 * @remarks
 * Each navigation supersedes cleanup from earlier transitions, including commits that skip animation.
 */
let activeNavigationViewTransitionId = 0;

/**
 * Wraps a router-provided page swap in the shared named-view-transition lifecycle.
 * @remarks Return `false` when the update did not commit; a void result counts as a committed update.
 */
export async function runNavigationViewTransition(
	update: () => void | boolean | Promise<void | boolean>,
	options: NavigationViewTransitionOptions,
): Promise<void> {
	const transitionId = ++activeNavigationViewTransitionId;
	const incomingDocument = options.incomingDocument ?? document;
	const updateWithoutTransition = async () => {
		try {
			const committed = (await update()) !== false;
			if (!committed && transitionId === activeNavigationViewTransitionId) {
				clearViewTransitionNames();
			}
		} catch (error) {
			if (transitionId === activeNavigationViewTransitionId) {
				clearViewTransitionNames();
			}
			throw error;
		}
	};
	if (!options.enabled) {
		await updateWithoutTransition();
		return;
	}

	ensureRootViewTransitionStyles();
	if (
		typeof document.startViewTransition !== 'function' ||
		!navigationHasNamedViewTransitions(document, incomingDocument)
	) {
		await updateWithoutTransition();
		return;
	}

	applyViewTransitionNames();
	let committed = false;
	const transition = document.startViewTransition(async () => {
		committed = (await update()) !== false;
		if (committed && transitionId === activeNavigationViewTransitionId) {
			applyViewTransitionNames();
		}
	}) as NavigationViewTransition;

	void transition.ready.catch(logViewTransitionError);
	void transition.finished.catch(logViewTransitionError).finally(() => {
		if (transitionId === activeNavigationViewTransitionId) {
			clearViewTransitionNames();
		}
	});

	await transition.updateCallbackDone;
	if (!committed && transitionId === activeNavigationViewTransitionId) {
		clearViewTransitionNames();
	}
}

function logViewTransitionError(error: unknown): void {
	if (error instanceof Error && error.name === 'AbortError') return;
	console.error('[ecopages] View transition lifecycle failed:', error);
}
