/**
 * Client-side router for Ecopages
 * Intercepts link clicks and performs client-side navigation
 * @module
 */

import type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types';
import { DEFAULT_OPTIONS } from './types';
import { DomSwapper, ScrollManager, ViewTransitionManager } from './services';

/**
 * EcoRouter provides client-side navigation for Ecopages.
 * Intercepts same-origin link clicks and swaps page content without full reloads.
 * Uses morphdom by default for efficient DOM diffing.
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

	/**
	 * Initialize the router and start intercepting navigation
	 */
	start(): void {
		document.addEventListener('click', this.handleClick);
		window.addEventListener('popstate', this.handlePopState);
	}

	/**
	 * Stop the router and remove event listeners
	 */
	stop(): void {
		document.removeEventListener('click', this.handleClick);
		window.removeEventListener('popstate', this.handlePopState);
	}

	/**
	 * Programmatically navigate to a URL
	 */
	async navigate(href: string, options: { replace?: boolean } = {}): Promise<void> {
		const url = new URL(href, window.location.origin);

		if (!this.isSameOrigin(url)) {
			window.location.href = href;
			return;
		}

		await this.performNavigation(url, options.replace ? 'replace' : 'forward');
	}

	/**
	 * Handle click events on links
	 */
	private handleClick(event: MouseEvent): void {
		const link = (event.target as Element).closest(this.options.linkSelector) as HTMLAnchorElement | null;

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

	/**
	 * Handle browser back/forward navigation
	 */
	private handlePopState(_event: PopStateEvent): void {
		const url = new URL(window.location.href);
		this.performNavigation(url, 'back');
	}

	/**
	 * Check if URL is same origin
	 */
	private isSameOrigin(url: URL): boolean {
		return url.origin === window.location.origin;
	}

	/**
	 * Perform the actual navigation
	 */
	private async performNavigation(url: URL, direction: EcoNavigationEvent['direction']): Promise<void> {
		const previousUrl = new URL(window.location.href);

		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const html = await this.fetchPage(url, this.abortController.signal);
			const newDocument = this.domSwapper.parseHTML(html);

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

			/**
			 * Update history BEFORE swapping DOM.
			 * This ensures web components can read the correct URL in connectedCallback.
			 */
			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			/** Perform the DOM swap with optional view transition */
			await this.viewTransitionManager.transition(() => {
				this.domSwapper.morphHead(newDocument);
				this.domSwapper.morphBody(newDocument);
				this.scrollManager.handleScroll(url, previousUrl);
			});

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
	 * Fetch a page's HTML content
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
 * Create and start a router instance
 */
export function createRouter(options?: EcoRouterOptions): EcoRouter {
	const router = new EcoRouter(options);
	router.start();
	return router;
}

// Re-export types for convenience
export type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types';
