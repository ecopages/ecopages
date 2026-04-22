import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BurgerEvents } from '../../../../components/burger/burger.events';
import { RadiantNavigation } from './navigation.script';

function resetDom(): void {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
}

function createNavigation(paths: string[]): RadiantNavigation {
	const navigation = document.createElement('radiant-navigation') as RadiantNavigation;
	navigation.className = 'hidden';

	for (const path of paths) {
		const link = document.createElement('a');
		link.setAttribute('data-nav-link', '');
		link.href = path;
		link.textContent = path;
		navigation.appendChild(link);
	}

	document.body.appendChild(navigation);
	return navigation;
}

function createNavigationElement(paths: string[]): RadiantNavigation {
	const navigation = document.createElement('radiant-navigation') as RadiantNavigation;
	navigation.className = 'hidden';

	for (const path of paths) {
		const link = document.createElement('a');
		link.setAttribute('data-nav-link', '');
		link.href = path;
		link.textContent = path;
		navigation.appendChild(link);
	}

	return navigation;
}

describe('RadiantNavigation', () => {
	beforeEach(() => {
		resetDom();
	});

	afterEach(() => {
		resetDom();
		vi.restoreAllMocks();
	});

	it('marks the active link and scrolls it into view on first connect', async () => {
		window.history.replaceState({}, '', '/docs/current');
		const navigation = createNavigationElement(['/docs/start', '/docs/current', '/docs/next']);
		const currentLink = navigation.querySelectorAll<HTMLAnchorElement>('[data-nav-link]')[1];
		const scrollIntoViewSpy = vi.fn();
		Object.defineProperty(currentLink, 'scrollIntoView', {
			configurable: true,
			value: scrollIntoViewSpy,
		});
		document.body.appendChild(navigation);

		await vi.waitFor(() => {
			expect(currentLink?.classList.contains('active')).toBe(true);
		});
		expect(navigation.querySelector('[href="/docs/start"]')?.classList.contains('active')).toBe(false);
		expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });
	});

	it('updates the active link after navigation and responds to burger events', async () => {
		window.history.replaceState({}, '', '/docs/start');
		const navigation = createNavigation(['/docs/start', '/docs/current', '/docs/next']);

		await vi.waitFor(() => {
			expect(navigation.querySelector('[href="/docs/start"]')?.classList.contains('active')).toBe(true);
		});

		window.history.replaceState({}, '', '/docs/current');
		document.dispatchEvent(new CustomEvent('eco:after-swap'));

		await vi.waitFor(() => {
			expect(navigation.querySelector('[href="/docs/current"]')?.classList.contains('active')).toBe(true);
		});
		expect(navigation.querySelector('[href="/docs/start"]')?.classList.contains('active')).toBe(false);

		window.dispatchEvent(new CustomEvent(BurgerEvents.TOGGLE_MENU));
		expect(navigation.classList.contains('hidden')).toBe(false);

		window.dispatchEvent(new CustomEvent(BurgerEvents.CLOSE_MENU));
		expect(navigation.classList.contains('hidden')).toBe(true);
	});
});