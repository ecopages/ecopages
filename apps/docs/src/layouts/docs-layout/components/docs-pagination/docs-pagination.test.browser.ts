import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { RadiantDocsPagination } from './docs-pagination.script';

function resetDom(): void {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/');
}

function createNavigation(paths: string[]): HTMLElement {
	const nav = document.createElement('radiant-navigation');
	for (const path of paths) {
		const link = document.createElement('a');
		link.setAttribute('data-nav-link', '');
		link.href = path;
		link.textContent = path.split('/').filter(Boolean).join(' ') || 'home';
		nav.appendChild(link);
	}
	document.body.appendChild(nav);
	return nav;
}

describe('RadiantDocsPagination', () => {
	beforeEach(() => {
		resetDom();
	});

	afterEach(() => {
		resetDom();
		vi.restoreAllMocks();
	});

	it('renders previous and next links around the active docs page', async () => {
		createNavigation(['/docs/start', '/docs/current', '/docs/next']);
		window.history.replaceState({}, '', '/docs/current');

		const pagination = document.createElement('radiant-docs-pagination') as RadiantDocsPagination;
		document.body.appendChild(pagination);

		await vi.waitFor(() => {
			expect(pagination.querySelector('a.prev')?.getAttribute('href')).toBe('/docs/start');
			expect(pagination.querySelector('a.next')?.getAttribute('href')).toBe('/docs/next');
		});
		expect(pagination.textContent).toContain('Previous');
		expect(pagination.textContent).toContain('Next');
	});

	it('recomputes pagination links after an after-swap update', async () => {
		createNavigation(['/docs/start', '/docs/current', '/docs/next']);
		window.history.replaceState({}, '', '/docs/start');

		const pagination = document.createElement('radiant-docs-pagination') as RadiantDocsPagination;
		document.body.appendChild(pagination);

		await vi.waitFor(() => {
			expect(pagination.querySelector('a.prev')).toBeNull();
			expect(pagination.querySelector('a.next')?.getAttribute('href')).toBe('/docs/current');
		});

		window.history.replaceState({}, '', '/docs/current');
		document.dispatchEvent(new CustomEvent('eco:after-swap'));

		await vi.waitFor(() => {
			expect(pagination.querySelector('a.prev')?.getAttribute('href')).toBe('/docs/start');
			expect(pagination.querySelector('a.next')?.getAttribute('href')).toBe('/docs/next');
		});
	});
});
