import { afterEach, beforeEach, expect, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import type { EcoRouter } from '../src/client/eco-router';

export type BrowserRouterTestWindow = Window &
	typeof globalThis & {
		__ECO_PAGES__?: {
			navigation?: unknown;
			react?: {
				cleanupPageRoot?: () => void;
			};
			page?: unknown;
		};
		__ecopages_browser_router__?: EcoRouter;
	};

export const runtimeWindow = window as BrowserRouterTestWindow;
export const initialUrl = `${window.location.origin}/`;
export const mockHtml = '<html><head></head><body><div id="content">New Content</div></body></html>';

export function resetBrowserRuntimeState(): void {
	runtimeWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();
	runtimeWindow.__ecopages_browser_router__?.stop();
	delete runtimeWindow.__ecopages_browser_router__;
	if (runtimeWindow.__ECO_PAGES__) {
		delete runtimeWindow.__ECO_PAGES__.navigation;
		if (runtimeWindow.__ECO_PAGES__.react) {
			delete runtimeWindow.__ECO_PAGES__.react.cleanupPageRoot;
		}
		delete runtimeWindow.__ECO_PAGES__.page;
	}
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.title = '';
	document.documentElement.removeAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.removeAttribute('lang');
	document.documentElement.removeAttribute('dir');
	document.documentElement.className = '';
	window.history.replaceState({}, '', initialUrl);
}

/**
 * Stubs `fetch` to answer every request with a fresh HTML response.
 *
 * @remarks
 * A `Response` body reads once. A prefetch and a click on the same link both fetch, so a shared
 * response made the second read fail and the router fell back to a real document load that
 * detached the test iframe.
 */
export function mockFetch(htmlContent: string) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => htmlFetchResponse(htmlContent));
}

export function htmlFetchResponse(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

export function createLink(attributes: Record<string, string>): HTMLAnchorElement {
	const link = document.createElement('a');
	for (const [key, value] of Object.entries(attributes)) {
		link.setAttribute(key, value);
	}
	link.textContent = 'Test Link';
	document.body.appendChild(link);
	return link;
}

export function simulateClick(element: HTMLElement, options: Partial<MouseEventInit> = {}): void {
	const event = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
		composed: true,
		button: 0,
		...options,
	});
	element.dispatchEvent(event);
}

export async function waitForNavigation(eventName = 'eco:after-swap'): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			document.removeEventListener(eventName, handleNavigation);
			reject(new Error(`Timed out waiting for ${eventName}`));
		}, 1000);

		const handleNavigation = () => {
			window.clearTimeout(timeoutId);
			resolve();
		};

		document.addEventListener(eventName, handleNavigation, { once: true });
	});
}

export function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

export function spyPushState() {
	return vi.spyOn(window.history, 'pushState');
}

/**
 * Clicks a link and asserts the router left the click alone.
 *
 * @remarks
 * Real clicks cover plain and modifier clicks. Middle and right buttons stay synthetic
 * because a real one fires `auxclick`, not `click`, and so does Ctrl+click on macOS,
 * which the platform turns into a context-menu gesture. The router decides in a capture
 * listener on `document`, so a bubble listener on `window` sees `defaultPrevented`
 * after the router and then cancels the default action to keep the page in place.
 * A click the router stopped from propagating never reaches it and fails the assertion.
 */
export async function clickWithoutNavigation(link: HTMLElement, options: Partial<MouseEventInit> = {}): Promise<void> {
	const pushStateSpy = spyPushState();
	let defaultPreventedByRouter: boolean | null = null;
	const recordAndCancel = (event: MouseEvent) => {
		defaultPreventedByRouter = event.defaultPrevented;
		event.preventDefault();
	};
	window.addEventListener('click', recordAndCancel);
	try {
		if (options.button || options.ctrlKey) {
			simulateClick(link, options);
		} else {
			await userEvent.click(link, { modifiers: getModifiers(options) });
		}
	} finally {
		window.removeEventListener('click', recordAndCancel);
	}
	expect(defaultPreventedByRouter).toBe(false);
	expect(pushStateSpy).not.toHaveBeenCalled();
}

function getModifiers(options: Partial<MouseEventInit>): Array<'Alt' | 'Meta' | 'Shift'> {
	const modifiers: Array<'Alt' | 'Meta' | 'Shift'> = [];
	if (options.altKey) modifiers.push('Alt');
	if (options.metaKey) modifiers.push('Meta');
	if (options.shiftKey) modifiers.push('Shift');
	return modifiers;
}

export async function clickWithNavigation(link: HTMLElement): Promise<void> {
	const pushStateSpy = spyPushState();
	await Promise.all([waitForNavigation(), userEvent.click(link)]);
	expect(pushStateSpy).toHaveBeenCalled();
}

export interface EcoRouterTestFixtures {
	router: EcoRouter | null;
	fetchSpy: ReturnType<typeof vi.spyOn> | null;
}

export function installEcoRouterTestHooks(fixtures: EcoRouterTestFixtures): void {
	beforeEach(() => {
		resetBrowserRuntimeState();
		fixtures.fetchSpy = mockFetch(mockHtml);
	});

	afterEach(() => {
		fixtures.router?.stop();
		fixtures.router = null;
		fixtures.fetchSpy?.mockRestore();
		resetBrowserRuntimeState();
		vi.restoreAllMocks();
	});
}
