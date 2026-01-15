/**
 * Client-side router for Ecopages with morphdom-based DOM diffing.
 * @module eco-router
 */

import type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types';
import { DEFAULT_OPTIONS } from './types';
import { DomSwapper, ScrollManager, ViewTransitionManager } from './services';

/**
 * Intercepts same-origin link clicks and performs client-side navigation
 * using morphdom for efficient DOM diffing. Supports View Transitions API.
 */
export class EcoRouter {
	private options: Required<EcoRouterOptions>;
	private abortController: AbortController | null = null;

	private domSwapper: DomSwapper;
	private scrollManager: ScrollManager;
	private viewTransitionManager: ViewTransitionManager;

	constructor(options: EcoRouterOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };

		this.domSwapper = new DomSwapper(this.options.persistAttribute);
		this.scrollManager = new ScrollManager(this.options.scrollBehavior, this.options.smoothScroll);
		this.viewTransitionManager = new ViewTransitionManager(this.options.viewTransitions);

		this.handleClick = this.handleClick.bind(this);
		this.handlePopState = this.handlePopState.bind(this);
	}

	/** Starts intercepting link clicks and popstate events. */
	public start(): void {
		document.addEventListener('click', this.handleClick);
		window.addEventListener('popstate', this.handlePopState);
	}

	/** Stops the router and removes all event listeners. */
	public stop(): void {
		document.removeEventListener('click', this.handleClick);
		window.removeEventListener('popstate', this.handlePopState);
	}

	/**
	 * Programmatic navigation.
	 * Falls back to full page reload for cross-origin URLs.
	 * @param href - The URL to navigate to
	 * @param options - Navigation options
	 * @param options.replace - If true, replaces the current history entry instead of pushing
	 */
	public async navigate(href: string, options: { replace?: boolean } = {}): Promise<void> {
		const url = new URL(href, window.location.origin);

		if (!this.isSameOrigin(url)) {
			window.location.href = href;
			return;
		}

		await this.performNavigation(url, options.replace ? 'replace' : 'forward');
	}

	/**
	 * Intercepts link clicks, filtering out modifier keys, external links, and opt-outs.
	 *
	 * Uses `event.composedPath()` instead of `event.target.closest()` to correctly
	 * handle clicks on anchor elements inside Shadow DOM boundaries (Web Components).
	 */
	private handleClick(event: MouseEvent): void {
		const link = event
			.composedPath()
			.find(
				(el) => el instanceof HTMLAnchorElement && el.matches(this.options.linkSelector),
			) as HTMLAnchorElement | null;

		if (!link) return;

		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (event.button !== 0) return;

		const target = link.getAttribute('target');
		if (target && target !== '_self') return;

		if (link.hasAttribute(this.options.reloadAttribute)) return;
		if (link.hasAttribute('download')) return;

		const href = link.getAttribute('href');
		if (!href) return;

		if (href.startsWith('#')) return;
		if (href.startsWith('javascript:')) return;

		const url = new URL(href, window.location.origin);

		if (!this.isSameOrigin(url)) return;

		event.preventDefault();
		this.performNavigation(url, 'forward');
	}

	/** Handles browser back/forward navigation via the History API. */
	private handlePopState(_event: PopStateEvent): void {
		const url = new URL(window.location.href);
		this.performNavigation(url, 'back');
	}

	/** Checks if the given URL shares the same origin as the current page. */
	private isSameOrigin(url: URL): boolean {
		return url.origin === window.location.origin;
	}

	/**
	 * Core navigation flow:
	 *
	 * 1. Fetch and parse new page
	 * 2. Dispatch `eco:before-swap` (allows reload override)
	 * 3. Update history (before DOM swap for correct URL in connectedCallback)
	 * 4. Preload stylesheets (activate immediately if no View Transitions)
	 * 5. Morph head/body with optional View Transition
	 * 6. Dispatch `eco:after-swap` and `eco:page-load`
	 *
	 * @param url - The target URL to navigate to
	 * @param direction - The navigation direction for event payloads
	 */
	private async performNavigation(url: URL, direction: EcoNavigationEvent['direction']): Promise<void> {
		const previousUrl = new URL(window.location.href);

		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const html = await this.fetchPage(url, this.abortController.signal);
			const newDocument = this.domSwapper.parseHTML(html, url);

			let shouldReload = false;
			const beforeSwapEvent: EcoBeforeSwapEvent = {
				url,
				direction,
				newDocument,
				reload: () => {
					shouldReload = true;
				},
			};

			document.dispatchEvent(new CustomEvent('eco:before-swap', { detail: beforeSwapEvent }));

			if (shouldReload) {
				window.location.href = url.href;
				return;
			}

			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			const useViewTransitions = this.options.viewTransitions;
			await this.domSwapper.preloadStylesheets(newDocument, !useViewTransitions);

			if (useViewTransitions) {
				await this.viewTransitionManager.transition(() => {
					this.domSwapper.morphHead(newDocument);
					this.domSwapper.morphBody(newDocument);
					this.scrollManager.handleScroll(url, previousUrl);
				});
			} else {
				this.domSwapper.morphHead(newDocument);
				this.domSwapper.replaceBody(newDocument);
				this.scrollManager.handleScroll(url, previousUrl);
			}

			const afterSwapEvent: EcoAfterSwapEvent = {
				url,
				direction,
			};

			document.dispatchEvent(new CustomEvent('eco:after-swap', { detail: afterSwapEvent }));

			requestAnimationFrame(() => {
				document.dispatchEvent(
					new CustomEvent('eco:page-load', {
						detail: { url, direction } as EcoNavigationEvent,
					}),
				);
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			console.error('[ecopages] Navigation failed:', error);
			window.location.href = url.href;
		}
	}

	/**
	 * Fetches the HTML content of a page.
	 * @param url - The URL to fetch
	 * @param signal - AbortSignal for cancelling the request
	 * @throws Error if the response is not ok
	 */
	private async fetchPage(url: URL, signal: AbortSignal): Promise<string> {
		const response = await fetch(url.href, {
			signal,
			headers: {
				Accept: 'text/html',
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch page: ${response.status}`);
		}

		return response.text();
	}
}

/**
 * Creates and starts a router instance.
 * @param options - Configuration options for the router
 * @returns A started EcoRouter instance
 */
export function createRouter(options?: EcoRouterOptions): EcoRouter {
	const router = new EcoRouter(options);
	router.start();
	return router;
}

export type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types';
