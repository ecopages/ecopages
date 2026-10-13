import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
	Reflect.deleteProperty(document as DocumentWithViewTransition, 'startViewTransition');
	document.getElementById(ROOT_STYLES_ID)?.remove();
	document.getElementById('eco-vt-dynamic-styles')?.remove();
	document.body.replaceChildren();
});

describe('runNavigationViewTransition', () => {
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
