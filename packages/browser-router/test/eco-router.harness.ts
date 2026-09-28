import { afterEach, beforeEach, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

export function mockFetch(htmlContent: string) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlFetchResponse(htmlContent));
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

export function preventDefaultOnClick(link: HTMLAnchorElement): void {
	link.addEventListener('click', (e) => e.preventDefault());
}

export function spyPushState() {
	return vi.spyOn(window.history, 'pushState');
}

export function clickWithoutNavigation(link: HTMLAnchorElement, options: Partial<MouseEventInit> = {}): void {
	const pushStateSpy = spyPushState();
	preventDefaultOnClick(link);
	simulateClick(link, options);
	expect(pushStateSpy).not.toHaveBeenCalled();
}

export async function clickWithNavigation(link: HTMLElement, options: Partial<MouseEventInit> = {}): Promise<void> {
	const pushStateSpy = spyPushState();
	simulateClick(link, options);
	await waitForNavigation();
	expect(pushStateSpy).toHaveBeenCalled();
}

export interface EcoRouterTestFixtures {
	router: EcoRouter | null;
	fetchSpy: ReturnType<typeof vi.spyOn> | null;
	user: ReturnType<typeof userEvent.setup>;
}

export function installEcoRouterTestHooks(fixtures: EcoRouterTestFixtures): void {
	beforeEach(() => {
		resetBrowserRuntimeState();
		fixtures.fetchSpy = mockFetch(mockHtml);
		fixtures.user = userEvent.setup();
	});

	afterEach(() => {
		fixtures.router?.stop();
		fixtures.router = null;
		fixtures.fetchSpy?.mockRestore();
		resetBrowserRuntimeState();
		vi.restoreAllMocks();
	});
}
