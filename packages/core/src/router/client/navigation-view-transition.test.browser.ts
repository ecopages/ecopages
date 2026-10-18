import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyViewTransitionNames } from '../../client/view-transitions.ts';
import { runNavigationViewTransition } from './navigation-view-transition.ts';

type DocumentWithViewTransition = Document & {
	startViewTransition?: (callback: () => void | Promise<void>) => {
		finished: Promise<void>;
		ready: Promise<void>;
		updateCallbackDone: Promise<void>;
		skipTransition(): void;
	};
};

const ROOT_STYLES_ID = 'eco-vt-root-styles';

/**
 * Installs a `startViewTransition` that runs the update on a microtask and reports the outcome
 * the test hands it.
 */
function installStartViewTransition(outcome: { finished: Promise<void>; ready: Promise<void> }) {
	const startViewTransition = vi.fn((callback: () => void | Promise<void>) => ({
		...outcome,
		updateCallbackDone: Promise.resolve().then(async () => {
			await callback();
		}),
		skipTransition() {},
	}));
	Reflect.set(document as DocumentWithViewTransition, 'startViewTransition', startViewTransition);
	return startViewTransition;
}

function installPendingViewTransitions() {
	const finishTransitions: Array<() => void> = [];
	const startViewTransition = vi.fn((callback: () => void | Promise<void>) => {
		const finished = new Promise<void>((resolve) => {
			finishTransitions.push(resolve);
		});
		return {
			finished,
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve().then(async () => callback()),
			skipTransition() {},
		};
	});
	Reflect.set(document as DocumentWithViewTransition, 'startViewTransition', startViewTransition);

	return {
		finishTransition(index = 0) {
			const finish = finishTransitions[index];
			if (!finish) throw new Error(`No view transition at index ${index}`);
			finish();
		},
		startViewTransition,
	};
}

afterEach(() => {
	Reflect.deleteProperty(document as DocumentWithViewTransition, 'startViewTransition');
	document.getElementById(ROOT_STYLES_ID)?.remove();
	document.getElementById('eco-vt-dynamic-styles')?.remove();
	document.body.replaceChildren();
});

describe('runNavigationViewTransition', () => {
	it('does not clear the names from a newer transition when an older one finishes later', async () => {
		document.body.innerHTML = '<div data-view-transition="first">First</div>';
		const { finishTransition } = installPendingViewTransitions();

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="second">Second</div>';
			},
			{ enabled: true },
		);
		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="third">Third</div>';
			},
			{ enabled: true },
		);

		finishTransition();
		await Promise.resolve();
		await Promise.resolve();
		const currentElement = document.querySelector('[data-view-transition]') as HTMLElement;
		expect(currentElement.style.viewTransitionName).toBe('third');

		finishTransition(1);
		await Promise.resolve();
		await Promise.resolve();
		expect(currentElement.style.viewTransitionName).toBe('');
	});

	it('does not clear names after a later navigation skips transitions', async () => {
		document.body.innerHTML = '<div data-view-transition="first">First</div>';
		const { finishTransition, startViewTransition } = installPendingViewTransitions();

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="second">Second</div>';
			},
			{ enabled: true },
		);
		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="third">Third</div>';
				applyViewTransitionNames();
			},
			{ enabled: false },
		);

		finishTransition();
		await Promise.resolve();
		await Promise.resolve();

		const currentElement = document.querySelector('[data-view-transition]') as HTMLElement;
		expect(currentElement.style.viewTransitionName).toBe('third');
		expect(startViewTransition).toHaveBeenCalledOnce();
	});

	it('does not apply names from a superseded transition after a later noncommit', async () => {
		document.body.innerHTML = '<div data-view-transition="first">First</div>';
		const { finishTransition } = installPendingViewTransitions();
		let resolveUpdate!: () => void;
		const pendingUpdate = new Promise<void>((resolve) => {
			resolveUpdate = resolve;
		});
		const supersededTransition = runNavigationViewTransition(
			async () => {
				await pendingUpdate;
			},
			{ enabled: true },
		);
		await Promise.resolve();

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="current">Current</div>';
				applyViewTransitionNames();
				return false;
			},
			{ enabled: false },
		);
		const currentElement = document.querySelector('[data-view-transition]') as HTMLElement;
		expect(currentElement.style.viewTransitionName).toBe('');

		resolveUpdate();
		await supersededTransition;
		expect(currentElement.style.viewTransitionName).toBe('');

		finishTransition();
		await Promise.resolve();
		await Promise.resolve();
		expect(currentElement.style.viewTransitionName).toBe('');
	});

	it('clears names when a transition-skipping update rejects', async () => {
		document.body.innerHTML = '<div data-view-transition="third">Third</div>';
		let rejectUpdate!: (reason?: unknown) => void;
		const failedUpdate = runNavigationViewTransition(
			async () => {
				applyViewTransitionNames();
				await new Promise<void>((_resolve, reject) => {
					rejectUpdate = reject;
				});
			},
			{ enabled: false },
		);

		const currentElement = document.querySelector('[data-view-transition]') as HTMLElement;
		expect(currentElement.style.viewTransitionName).toBe('third');

		rejectUpdate(new Error('update failed'));
		await expect(failedUpdate).rejects.toThrow('update failed');
		expect(currentElement.style.viewTransitionName).toBe('');
	});

	it('clears names when a later navigation without transitions does not commit', async () => {
		document.body.innerHTML = '<div data-view-transition="first">First</div>';
		const { finishTransition, startViewTransition } = installPendingViewTransitions();

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="second">Second</div>';
			},
			{ enabled: true },
		);
		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div data-view-transition="third">Third</div>';
				applyViewTransitionNames();
				return false;
			},
			{ enabled: false },
		);

		const currentElement = document.querySelector('[data-view-transition]') as HTMLElement;
		expect(currentElement.style.viewTransitionName).toBe('');

		finishTransition();
		await Promise.resolve();
		await Promise.resolve();
		expect(currentElement.style.viewTransitionName).toBe('');
		expect(startViewTransition).toHaveBeenCalledOnce();
	});

	it('swaps without startViewTransition when no named transition elements are present', async () => {
		const startViewTransition = installStartViewTransition({
			finished: Promise.resolve(),
			ready: Promise.resolve(),
		});

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div>Updated</div>';
			},
			{ enabled: true },
		);

		expect(startViewTransition).not.toHaveBeenCalled();
		expect(document.body.innerHTML).toContain('Updated');
	});

	it('swaps inside startViewTransition when the page has named elements and ignores a skipped transition', async () => {
		document.body.innerHTML = '<div data-view-transition="hero">Old</div>';
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const skipped = new DOMException('Transition was skipped', 'AbortError');
		const startViewTransition = installStartViewTransition({
			finished: Promise.reject(skipped),
			ready: Promise.reject(skipped),
		});

		await runNavigationViewTransition(
			() => {
				document.body.innerHTML = '<div>Updated</div>';
			},
			{ enabled: true },
		);
		await Promise.resolve();

		expect(startViewTransition).toHaveBeenCalledTimes(1);
		expect(document.body.innerHTML).toContain('Updated');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('logs a view transition failure that is not a skip', async () => {
		document.body.innerHTML = '<div data-view-transition="hero">Old</div>';
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('transition failed');
		installStartViewTransition({ finished: Promise.reject(failure), ready: Promise.resolve() });

		await runNavigationViewTransition(() => {}, { enabled: true });
		await vi.waitFor(() =>
			expect(consoleSpy).toHaveBeenCalledWith('[ecopages] View transition lifecycle failed:', failure),
		);
	});

	it.each([
		{ enabled: true, expectedStyles: true },
		{ enabled: false, expectedStyles: false },
	])('installs the root styles only when enabled is $enabled', async ({ enabled, expectedStyles }) => {
		await runNavigationViewTransition(() => {}, { enabled });

		expect(document.getElementById(ROOT_STYLES_ID) !== null).toBe(expectedStyles);
	});
});
