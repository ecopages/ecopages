import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createRouter, EcoRouter } from './eco-router';

function mockFetch(htmlContent: string) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
		ok: true,
		text: async () => htmlContent,
	} as Response);
}

describe('EcoRouter', () => {
	let router: EcoRouter;
	const mockHtml = '<html><head></head><body><div id="content">New Content</div></body></html>';

	beforeEach(() => {
		document.body.innerHTML = '';
		mockFetch(mockHtml);
	});

	afterEach(() => {
		router?.stop();
		vi.restoreAllMocks();
	});

	describe('Initialization', () => {
		it('should create router instance', () => {
			router = createRouter();
			expect(router).toBeInstanceOf(EcoRouter);
		});

		it('should start and stop without errors', () => {
			router = new EcoRouter();
			expect(() => router.start()).not.toThrow();
			expect(() => router.stop()).not.toThrow();
		});
	});

	describe('Programmatic Navigation', () => {
		it('should navigate and update history with pushState', async () => {
			router = createRouter();
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			await router.navigate('/new-page');

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/new-page'));
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('should use replaceState when replace option is true', async () => {
			router = createRouter();
			const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

			await router.navigate('/replaced-page', { replace: true });

			expect(replaceStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/replaced-page'));
		});
	});

	describe('Link Interception', () => {
		it('should intercept clicks on internal links', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="/test-link" id="link">Link</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('link');
			expect(link).not.toBeNull();
			await userEvent.click(link!);

			expect(pushStateSpy).toHaveBeenCalled();
		});

		it('should NOT intercept external links', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="https://example.com" id="ext-link">External</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('ext-link')!;
			link.addEventListener('click', (e) => e.preventDefault());
			await userEvent.click(link);

			expect(pushStateSpy).not.toHaveBeenCalled();
		});

		it('should NOT intercept links with target="_blank"', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="/page" target="_blank" id="blank-link">New Tab</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('blank-link')!;
			link.addEventListener('click', (e) => e.preventDefault());
			await userEvent.click(link);

			expect(pushStateSpy).not.toHaveBeenCalled();
		});

		it('should NOT intercept links with download attribute', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="/file.pdf" download id="dl-link">Download</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('dl-link')!;
			link.addEventListener('click', (e) => e.preventDefault());
			await userEvent.click(link);

			expect(pushStateSpy).not.toHaveBeenCalled();
		});

		it('should NOT intercept hash-only links', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="#section" id="hash-link">Jump</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('hash-link')!;
			link.addEventListener('click', (e) => e.preventDefault());
			await userEvent.click(link);

			expect(pushStateSpy).not.toHaveBeenCalled();
		});

		it('should NOT intercept links with data-eco-reload attribute', async () => {
			router = createRouter();
			document.body.innerHTML = '<a href="/reload" data-eco-reload id="reload-link">Reload</a>';
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			const link = document.getElementById('reload-link')!;
			link.addEventListener('click', (e) => e.preventDefault());
			await userEvent.click(link);

			expect(pushStateSpy).not.toHaveBeenCalled();
		});
	});

	describe('Lifecycle Events', () => {
		it('should dispatch eco:before-swap, eco:after-swap, and eco:page-load events', async () => {
			router = createRouter();
			const beforeSwapSpy = vi.fn();
			const afterSwapSpy = vi.fn();
			const pageLoadSpy = vi.fn();

			document.addEventListener('eco:before-swap', beforeSwapSpy);
			document.addEventListener('eco:after-swap', afterSwapSpy);
			document.addEventListener('eco:page-load', pageLoadSpy);

			try {
				await router.navigate('/event-test');

				expect(beforeSwapSpy).toHaveBeenCalledTimes(1);
				expect(afterSwapSpy).toHaveBeenCalledTimes(1);

				await new Promise((resolve) => requestAnimationFrame(resolve));
				expect(pageLoadSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:before-swap', beforeSwapSpy);
				document.removeEventListener('eco:after-swap', afterSwapSpy);
				document.removeEventListener('eco:page-load', pageLoadSpy);
			}
		});

		it('should provide event details with url and direction', async () => {
			router = createRouter();
			let eventDetail: any;

			const handler = (e: CustomEvent) => {
				eventDetail = e.detail;
			};
			document.addEventListener('eco:after-swap', handler as EventListener);

			try {
				await router.navigate('/detail-test');

				expect(eventDetail).toBeDefined();
				expect(eventDetail.url).toBeInstanceOf(URL);
				expect(eventDetail.direction).toBe('forward');
			} finally {
				document.removeEventListener('eco:after-swap', handler as EventListener);
			}
		});
	});
});
