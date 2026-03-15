import { describe, expect, it, vi } from 'vitest';
import { getEcoNavigationRuntime } from './navigation-coordinator.ts';

function createWindowLike() {
	return {} as Window &
		typeof globalThis & {
			__ecopages_navigation__?: ReturnType<typeof getEcoNavigationRuntime>;
			__ecopages_cleanup_page_root__?: () => void;
		};
}

describe('getEcoNavigationRuntime', () => {
	it('returns the same coordinator instance for the same window', () => {
		const windowLike = createWindowLike();
		const first = getEcoNavigationRuntime(windowLike);
		const second = getEcoNavigationRuntime(windowLike);

		expect(first).toBe(second);
	});

	it('tracks explicit owner changes', () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);

		runtime.setOwner('react-router');

		expect(runtime.getOwnerState()).toEqual({
			owner: 'react-router',
			canHandleSpaNavigation: false,
		});
	});

	it('delegates navigation to another registered runtime when the source cannot handle it', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const navigateSpy = vi.fn(async () => true);

		runtime.register({ owner: 'browser-router', navigate: navigateSpy });
		runtime.register({ owner: 'react-router', navigate: vi.fn(async () => true) });
		runtime.setOwner('react-router');

		const handled = await runtime.requestNavigation({
			href: '/docs',
			direction: 'forward',
			source: 'react-router',
		});

		expect(handled).toBe(true);
		expect(navigateSpy).toHaveBeenCalledWith({
			href: '/docs',
			direction: 'forward',
			source: 'react-router',
		});
	});

	it('reloads the current owner through its registration', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const reloadSpy = vi.fn(async () => undefined);

		runtime.register({ owner: 'react-router', reloadCurrentPage: reloadSpy });
		runtime.setOwner('react-router');

		const handled = await runtime.reloadCurrentPage({ clearCache: true, source: 'browser-router' });

		expect(handled).toBe(true);
		expect(reloadSpy).toHaveBeenCalledWith({ clearCache: true, source: 'browser-router' });
	});

	it('reloads the current owner even when the request source matches that owner', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const reloadSpy = vi.fn(async () => undefined);

		runtime.register({ owner: 'react-router', reloadCurrentPage: reloadSpy });
		runtime.setOwner('react-router');

		const handled = await runtime.reloadCurrentPage({ clearCache: false, source: 'react-router' });

		expect(handled).toBe(true);
		expect(reloadSpy).toHaveBeenCalledWith({ clearCache: false, source: 'react-router' });
	});

	it('cleans up the current owner via its registration', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const cleanupSpy = vi.fn();

		runtime.register({ owner: 'react-router', cleanupBeforeHandoff: cleanupSpy });
		runtime.setOwner('react-router');

		await runtime.cleanupCurrentOwner();

		expect(cleanupSpy).toHaveBeenCalledTimes(1);
	});
});