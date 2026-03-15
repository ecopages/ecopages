import { describe, expect, it, vi } from 'vitest';
import { getEcoNavigationRuntime } from './navigation-coordinator.ts';

function createWindowLike() {
	return {} as Window &
		typeof globalThis & {
			__ecopages_navigation__?: ReturnType<typeof getEcoNavigationRuntime>;
		};
}

describe('getEcoNavigationRuntime', () => {
	it('returns the same coordinator instance for the same window', () => {
		const windowLike = createWindowLike();
		const first = getEcoNavigationRuntime(windowLike);
		const second = getEcoNavigationRuntime(windowLike);

		expect(first).toBe(second);
	});

	it('tracks explicit ownership claims', () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);

		runtime.claimOwnership('react-router');

		expect(runtime.getOwnerState()).toEqual({
			owner: 'react-router',
			canHandleSpaNavigation: false,
		});
	});

	it('adopts ownership from the rendered document marker', () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const documentLike = {
			documentElement: {
				getAttribute: vi.fn(() => 'custom-router'),
			},
		} as unknown as Document;

		expect(runtime.adoptDocumentOwner(documentLike, 'browser-router')).toBe('custom-router');
		expect(runtime.getOwnerState().owner).toBe('custom-router');
	});

	it('delegates navigation to another registered runtime when the source cannot handle it', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const navigateSpy = vi.fn(async () => true);

		runtime.register({ owner: 'browser-router', navigate: navigateSpy });
		runtime.register({ owner: 'react-router', navigate: vi.fn(async () => true) });
		runtime.claimOwnership('react-router');

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

	it('delegates a fetched document handoff to the targeted runtime after cleaning up the current owner', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const cleanupSpy = vi.fn(async () => undefined);
		const handoffSpy = vi.fn(async () => true);
		const documentLike = {
			documentElement: {
				getAttribute: vi.fn(() => null),
			},
		} as unknown as Document;

		runtime.register({ owner: 'react-router', cleanupBeforeHandoff: cleanupSpy });
		runtime.register({ owner: 'browser-router', handoffNavigation: handoffSpy });
		runtime.claimOwnership('react-router');

		const handled = await runtime.requestHandoff({
			href: '/docs',
			finalHref: '/docs',
			direction: 'forward',
			source: 'react-router',
			targetOwner: 'browser-router',
			document: documentLike,
		});

		expect(handled).toBe(true);
		expect(cleanupSpy).toHaveBeenCalledTimes(1);
		expect(handoffSpy).toHaveBeenCalledWith({
			href: '/docs',
			finalHref: '/docs',
			direction: 'forward',
			source: 'react-router',
			targetOwner: 'browser-router',
			document: documentLike,
		});
		expect(cleanupSpy.mock.invocationCallOrder[0]).toBeLessThan(handoffSpy.mock.invocationCallOrder[0]);
	});

	it('reloads the current owner through its registration', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const reloadSpy = vi.fn(async () => undefined);

		runtime.register({ owner: 'react-router', reloadCurrentPage: reloadSpy });
		runtime.claimOwnership('react-router');

		const handled = await runtime.reloadCurrentPage({ clearCache: true, source: 'browser-router' });

		expect(handled).toBe(true);
		expect(reloadSpy).toHaveBeenCalledWith({ clearCache: true, source: 'browser-router' });
	});

	it('reloads the current owner even when the request source matches that owner', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const reloadSpy = vi.fn(async () => undefined);

		runtime.register({ owner: 'react-router', reloadCurrentPage: reloadSpy });
		runtime.claimOwnership('react-router');

		const handled = await runtime.reloadCurrentPage({ clearCache: false, source: 'react-router' });

		expect(handled).toBe(true);
		expect(reloadSpy).toHaveBeenCalledWith({ clearCache: false, source: 'react-router' });
	});

	it('cleans up an explicit owner via its registration', async () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const cleanupSpy = vi.fn();

		runtime.register({ owner: 'react-router', cleanupBeforeHandoff: cleanupSpy });
		runtime.claimOwnership('react-router');

		await runtime.cleanupOwner('react-router');

		expect(cleanupSpy).toHaveBeenCalledTimes(1);
		expect(runtime.getOwnerState().owner).toBe('none');
	});

	it('emits events for registrations and ownership changes', () => {
		const windowLike = createWindowLike();
		const runtime = getEcoNavigationRuntime(windowLike);
		const listener = vi.fn();
		const unsubscribe = runtime.subscribe(listener);

		const unregister = runtime.register({ owner: 'custom-router' });
		runtime.claimOwnership('custom-router');
		runtime.releaseOwnership('custom-router');
		unregister();
		unsubscribe();

		expect(listener).toHaveBeenCalledWith({
			type: 'registration-change',
			owner: 'custom-router',
			status: 'registered',
		});
		expect(listener).toHaveBeenCalledWith({
			type: 'owner-change',
			owner: 'custom-router',
			previousOwner: 'none',
			reason: 'claim',
		});
	});
});
