import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATE_EVENT, navigateTo } from './navigation';

function stubWindow(claim: boolean) {
	const assign = vi.fn();
	const replace = vi.fn();
	vi.stubGlobal('location', { assign, replace });
	vi.stubGlobal('window', {
		dispatchEvent: (event: CustomEvent) => {
			expect(event.type).toBe(NAVIGATE_EVENT);
			if (claim) event.preventDefault();
			return !event.defaultPrevented;
		},
	});
	return { assign, replace };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('navigateTo', () => {
	it('leaves the page to the router that claims the event', () => {
		const location = stubWindow(true);

		navigateTo('/cart', { replace: true });

		expect(location.assign).not.toHaveBeenCalled();
		expect(location.replace).not.toHaveBeenCalled();
	});

	it('loads the page in full when nothing claims the event', () => {
		const location = stubWindow(false);

		navigateTo('https://checkout.shop.test/c/1');
		navigateTo('/cart', { replace: true });

		expect(location.assign).toHaveBeenCalledWith('https://checkout.shop.test/c/1');
		expect(location.replace).toHaveBeenCalledWith('/cart');
	});
});
