import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RadiantToc } from './toc.script';

type RectInit = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height' | 'x' | 'y'>;

function resetDom(): void {
	document.body.innerHTML = '';
	window.history.replaceState({}, '', '/docs/page');
}

function createRect(overrides: Partial<RectInit>): DOMRect {
	const rect = {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		width: 0,
		height: 0,
		x: 0,
		y: 0,
		...overrides,
	};
	return {
		...rect,
		toJSON: () => rect,
	} as DOMRect;
}

function setHeadingTop(element: HTMLElement, top: number): void {
	Object.defineProperty(element, 'getBoundingClientRect', {
		configurable: true,
		value: () => createRect({ top, bottom: top + 40, height: 40 }),
	});
}

function createDocsContent(): { content: HTMLElement; headings: HTMLElement[] } {
	const content = document.createElement('main');
	content.className = 'docs-layout__content';
	content.innerHTML = `
		<h2>Introduction</h2>
		<h3>When to Use</h3>
		<h3>When to Use</h3>
		<h2>Installation</h2>
	`;
	document.body.appendChild(content);
	return {
		content,
		headings: Array.from(content.querySelectorAll<HTMLElement>('h2, h3')),
	};
}

describe('RadiantToc', () => {
	beforeEach(() => {
		resetDom();
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }),
		});
		Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
		Object.defineProperty(document.documentElement, 'scrollHeight', {
			configurable: true,
			value: 2400,
			writable: true,
		});
	});

	afterEach(() => {
		resetDom();
		vi.restoreAllMocks();
	});

	it('renders unique anchor targets for repeated headings', async () => {
		const { headings } = createDocsContent();
		setHeadingTop(headings[0], 80);
		setHeadingTop(headings[1], 160);
		setHeadingTop(headings[2], 240);
		setHeadingTop(headings[3], 320);

		const toc = document.createElement('radiant-toc') as RadiantToc;
		document.body.appendChild(toc);

		await vi.waitFor(() => {
			const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[data-toc-link]'));
			expect(links.map((link) => link.getAttribute('data-toc-link'))).toEqual([
				'introduction',
				'when-to-use',
				'when-to-use-2',
				'installation',
			]);
		});
		expect(headings[1]?.id).toBe('when-to-use');
		expect(headings[2]?.id).toBe('when-to-use-2');
		expect(toc.querySelector('a[data-toc-link="when-to-use-2"]')?.classList.contains('toc-depth-3')).toBe(true);
	});

	it('keeps the clicked heading active until the pending scroll target is reached', async () => {
		const user = userEvent.setup();
		const { headings } = createDocsContent();
		setHeadingTop(headings[0], 80);
		setHeadingTop(headings[1], 160);
		setHeadingTop(headings[2], 240);
		setHeadingTop(headings[3], 360);
		const scrollIntoViewSpy = vi.fn();
		Object.defineProperty(headings[3], 'scrollIntoView', {
			configurable: true,
			value: scrollIntoViewSpy,
		});

		const toc = document.createElement('radiant-toc') as RadiantToc;
		document.body.appendChild(toc);

		await vi.waitFor(() => {
			expect(toc.querySelector('a.toc-active')?.getAttribute('data-toc-link')).toBe('introduction');
		});

		const installationLink = toc.querySelector<HTMLAnchorElement>('a[data-toc-link="installation"]');
		expect(installationLink).not.toBeNull();

		await user.click(installationLink!);
		window.dispatchEvent(new Event('scroll'));

		await vi.waitFor(() => {
			expect(toc.querySelector('a.toc-active')?.getAttribute('data-toc-link')).toBe('installation');
		});
		expect(toc.querySelector('a[data-toc-link="installation"]')?.getAttribute('aria-current')).toBe('location');
		expect(window.location.hash).toBe('#installation');
		expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
	});
});
