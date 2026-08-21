import { describe, expect, it, vi } from 'vitest';
import { createCollectionComponentCache } from './collection-component-cache.ts';

const Component = () => null;

describe('createCollectionComponentCache', () => {
	it('rejects synchronous access before preload', () => {
		const cache = createCollectionComponentCache(async () => Component);

		expect(() => cache.get('first')).toThrow("Collection content 'first' was rendered before it was preloaded.");
	});

	it('coalesces in-flight loads and exposes the resolved component synchronously', async () => {
		let resolveComponent: ((component: typeof Component) => void) | undefined;
		const load = vi.fn(
			() =>
				new Promise<typeof Component>((resolve) => {
					resolveComponent = resolve;
				}),
		);
		const cache = createCollectionComponentCache(load);

		const first = cache.preload('first');
		const second = cache.preload('first');
		expect(load).toHaveBeenCalledTimes(1);
		resolveComponent?.(Component);
		await Promise.all([first, second]);

		expect(cache.get('first')).toBe(Component);
	});

	it('preserves load errors for synchronous render and retries on the next preload', async () => {
		const error = new Error('missing component');
		const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(Component);
		const cache = createCollectionComponentCache(load);

		await expect(cache.preload('missing')).rejects.toThrow(error);
		expect(() => cache.get('missing')).toThrow(error);
		await cache.preload('missing');

		expect(load).toHaveBeenCalledTimes(2);
		expect(cache.get('missing')).toBe(Component);
	});

	it('reloads after success so HMR can replace the component', async () => {
		const UpdatedComponent = () => null;
		const load = vi.fn().mockResolvedValueOnce(Component).mockResolvedValueOnce(UpdatedComponent);
		const cache = createCollectionComponentCache(load);

		await cache.preload('first');
		expect(cache.get('first')).toBe(Component);
		await cache.preload('first');

		expect(load).toHaveBeenCalledTimes(2);
		expect(cache.get('first')).toBe(UpdatedComponent);
	});

	it('accepts a server-resolved component without invoking the browser loader', async () => {
		const load = vi.fn().mockResolvedValue(Component);
		const cache = createCollectionComponentCache(load);

		await cache.prime('first', Promise.resolve(Component));

		expect(load).not.toHaveBeenCalled();
		expect(cache.get('first')).toBe(Component);
	});

	it('lets prime replace an in-flight preload with the server component', async () => {
		const ServerComponent = () => null;
		let resolveBrowser: ((component: typeof Component) => void) | undefined;
		const load = vi.fn(
			() =>
				new Promise<typeof Component>((resolve) => {
					resolveBrowser = resolve;
				}),
		);
		const cache = createCollectionComponentCache(load);

		const pendingPreload = cache.preload('first');
		await cache.prime('first', Promise.resolve(ServerComponent));
		resolveBrowser?.(Component);
		await pendingPreload;

		expect(cache.get('first')).toBe(ServerComponent);
	});
});
