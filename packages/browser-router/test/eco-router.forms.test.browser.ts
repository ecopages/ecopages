import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { getEcoNavigationRuntime } from '@ecopages/core/client';
import { createRouter } from '../src/client/eco-router';
import {
	htmlFetchResponse,
	installEcoRouterTestHooks,
	spyPushState,
	waitForNavigation,
	type EcoRouterTestFixtures,
} from './eco-router.harness';

/**
 * A form with a text field and a submit button, in the document.
 *
 * @remarks
 * The field is the first child and the button the last, so a test clicks `button` or presses Enter in `input`.
 */
function createForm(
	attributes: Record<string, string>,
	buttonAttributes: Record<string, string> = {},
): HTMLFormElement {
	const form = document.createElement('form');
	for (const [key, value] of Object.entries(attributes)) form.setAttribute(key, value);
	const input = document.createElement('input');
	input.name = 'q';
	input.value = 'chair';
	const button = document.createElement('button');
	button.type = 'submit';
	button.textContent = 'Search';
	for (const [key, value] of Object.entries(buttonAttributes)) button.setAttribute(key, value);
	form.append(input, button);
	document.body.append(form);
	return form;
}

/**
 * Submits a form with the router out of the way of the browser, and reports what the router did to the event.
 *
 * @remarks
 * Submitting a form the router leaves alone would load the page into the test frame. A listener on `window`
 * runs after the router's on `document`, records whether the router cancelled the submission, and cancels it
 * itself so the page stays.
 */
async function submitAndRecord(form: HTMLFormElement): Promise<{ routerCancelled: boolean }> {
	let routerCancelled: boolean | null = null;
	const record = (event: Event) => {
		routerCancelled = event.defaultPrevented;
		event.preventDefault();
	};
	window.addEventListener('submit', record);
	try {
		await userEvent.click(form.querySelector('button')!);
	} finally {
		window.removeEventListener('submit', record);
	}
	expect(routerCancelled).not.toBeNull();
	return { routerCancelled: routerCancelled === true };
}

describe('EcoRouter form submission', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	function fetchedUrls(): string[] {
		return (fixtures.fetchSpy?.mock.calls ?? []).map((call: unknown[]) => String(call[0]));
	}

	describe('GET forms', () => {
		it('navigates to the action with the fields as its query when the button is pressed', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });

			await Promise.all([waitForNavigation(), userEvent.click(form.querySelector('button')!)]);

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', `${window.location.origin}/search?q=chair`);
			expect(fetchedUrls()).toEqual([`${window.location.origin}/search?q=chair`]);
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('navigates when Enter is pressed in a field', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });
			const input = form.querySelector('input')!;

			input.focus();
			await Promise.all([waitForNavigation(), userEvent.keyboard('{Enter}')]);

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', `${window.location.origin}/search?q=chair`);
		});

		it('navigates when the page submits the form with requestSubmit()', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });

			const navigation = waitForNavigation();
			form.requestSubmit();
			await navigation;

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', `${window.location.origin}/search?q=chair`);
		});

		it('does not navigate when the form is invalid, as the browser would not submit it', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });
			form.querySelector('input')!.required = true;
			form.querySelector('input')!.value = '';

			await userEvent.click(form.querySelector('button')!);

			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(fetchedUrls()).toEqual([]);
		});

		it('uses the formaction of the button that submitted', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' }, { formaction: '/shop' });

			await Promise.all([waitForNavigation(), userEvent.click(form.querySelector('button')!)]);

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', `${window.location.origin}/shop?q=chair`);
		});

		it('adds one history entry per submission', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });

			await Promise.all([waitForNavigation(), userEvent.click(form.querySelector('button')!)]);

			expect(pushStateSpy).toHaveBeenCalledTimes(1);
		});

		it('replays the last of two quick submissions, like two link clicks', async () => {
			fixtures.fetchSpy?.mockImplementation(
				(input: string | URL | Request, init?: RequestInit) =>
					new Promise<Response>((resolve, reject) => {
						if (String(input).includes('q=second')) {
							resolve(
								htmlFetchResponse(
									'<html><head></head><body><div id="content">Second</div></body></html>',
								),
							);
							return;
						}
						init?.signal?.addEventListener(
							'abort',
							() => reject(new DOMException('Aborted', 'AbortError')),
							{
								once: true,
							},
						);
					}),
			);
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });
			const input = form.querySelector('input')!;

			input.value = 'first';
			await userEvent.click(form.querySelector('button')!);
			input.value = 'second';
			const navigation = waitForNavigation();
			await userEvent.click(form.querySelector('button')!);
			await navigation;

			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).toHaveBeenCalledWith({}, '', `${window.location.origin}/search?q=second`);
			expect(document.body.innerHTML).toContain('Second');
		});
	});

	describe('forms left to the browser', () => {
		const rows: Array<{
			name: string;
			form: Record<string, string>;
			button?: Record<string, string>;
			routerOptions?: Parameters<typeof createRouter>[0];
		}> = [
			{ name: 'a POST form', form: { action: '/cart', method: 'post' } },
			{
				name: 'a button that makes the form a POST',
				form: { action: '/search' },
				button: { formmethod: 'post' },
			},
			{ name: 'a form with a target other than _self', form: { action: '/search', target: '_blank' } },
			{ name: 'a cross-origin action', form: { action: 'https://example.com/search' } },
			{ name: 'the reload attribute on the form', form: { action: '/search', 'data-eco-reload': '' } },
			{
				name: 'the reload attribute on the button',
				form: { action: '/search' },
				button: { 'data-eco-reload': '' },
			},
			{
				name: 'the configured reload attribute',
				form: { action: '/search', 'data-full-reload': '' },
				routerOptions: { reloadAttribute: 'data-full-reload' },
			},
		];

		it.each(rows)('does not intercept $name', async ({ form: formAttributes, button, routerOptions }) => {
			fixtures.router = createRouter(routerOptions);
			const pushStateSpy = spyPushState();
			const form = createForm(formAttributes, button);

			const { routerCancelled } = await submitAndRecord(form);

			expect(routerCancelled).toBe(false);
			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(fetchedUrls()).toEqual([]);
		});

		it('leaves a submission to the page that cancelled it', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });
			const handled = vi.fn((event: Event) => event.preventDefault());
			form.addEventListener('submit', handled);

			await submitAndRecord(form);

			expect(handled).toHaveBeenCalledOnce();
			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(fetchedUrls()).toEqual([]);
		});

		it('stops intercepting once the router has stopped', async () => {
			fixtures.router = createRouter();
			fixtures.router.stop();
			const form = createForm({ action: '/search', method: 'get' });

			const { routerCancelled } = await submitAndRecord(form);

			expect(routerCancelled).toBe(false);
		});
	});

	describe('another runtime owns the document', () => {
		it('hands the submission to the active runtime instead of dropping it', async () => {
			const navigateSpy = vi.fn(async () => true);
			fixtures.router = createRouter();
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'react-router',
				navigate: navigateSpy,
			});
			getEcoNavigationRuntime(window).claimOwnership('react-router');
			const pushStateSpy = spyPushState();
			const form = createForm({ action: '/search', method: 'get' });

			try {
				const { routerCancelled } = await submitAndRecord(form);
				await vi.waitFor(() =>
					expect(navigateSpy).toHaveBeenCalledWith({
						href: '/search?q=chair',
						direction: 'forward',
						source: 'browser-router',
					}),
				);
				expect(routerCancelled).toBe(true);
				expect(pushStateSpy).not.toHaveBeenCalled();
			} finally {
				unregister();
			}
		});
	});
});
