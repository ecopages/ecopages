/**
 * Client-side router for Ecopages with morphdom-based DOM diffing.
 * @module eco-router
 */

import type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types.ts';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { DEFAULT_OPTIONS } from './types.ts';
import { DomSwapper, ScrollManager, ViewTransitionManager, PrefetchManager } from './services/index.ts';

/**
 * Intercepts same-origin link clicks and performs client-side navigation
 * using morphdom for efficient DOM diffing. Supports View Transitions API.
 */
export class EcoRouter {
	private options: Required<EcoRouterOptions>;
	private abortController: AbortController | null = null;
	private navigationSequence = 0;
	private unregisterNavigationRuntime: (() => void) | null = null;

	private domSwapper: DomSwapper;
	private scrollManager: ScrollManager;
	private viewTransitionManager: ViewTransitionManager;
	private prefetchManager: PrefetchManager | null = null;

	constructor(options: EcoRouterOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };

		this.domSwapper = new DomSwapper(this.options.persistAttribute);
		this.scrollManager = new ScrollManager(this.options.scrollBehavior, this.options.smoothScroll);
		this.viewTransitionManager = new ViewTransitionManager(this.options.viewTransitions);

		if (this.options.prefetch !== false) {
			this.prefetchManager = new PrefetchManager({
				...this.options.prefetch,
				linkSelector: this.options.linkSelector,
			});
		}

		this.handleClick = this.handleClick.bind(this);
		this.handlePopState = this.handlePopState.bind(this);
	}

	private isAnotherNavigationRuntimeActive(): boolean {
		return getEcoNavigationRuntime(window).isOwnedByAnotherRuntime('browser-router');
	}

	private getDocumentOwner(doc: Document) {
		return getEcoNavigationRuntime(window).resolveDocumentOwner(doc, 'browser-router');
	}

	private adoptDocumentOwner(doc: Document): void {
		getEcoNavigationRuntime(window).adoptDocumentOwner(doc, 'browser-router');
	}

	private reloadDocument(url: URL): void {
		window.location.assign(url.href);
	}

	/**
	 * Starts the router and begins intercepting navigation.
	 *
	 * Attaches click handlers for links and popstate handlers for browser
	 * back/forward buttons. Also starts the prefetch manager if configured.
	 */
	public start(): void {
		const navigationRuntime = getEcoNavigationRuntime(window);

		document.addEventListener('click', this.handleClick);
		window.addEventListener('popstate', this.handlePopState);
		this.prefetchManager?.start();
		this.unregisterNavigationRuntime?.();
		this.unregisterNavigationRuntime = navigationRuntime.register({
			owner: 'browser-router',
			navigate: async (request) => {
				await this.performNavigation(
					new URL(request.href, window.location.origin),
					request.direction ?? 'forward',
				);
				return true;
			},
			reloadCurrentPage: async (request) => {
				const currentUrl = window.location.pathname + window.location.search;

				if (request?.clearCache) {
					this.prefetchManager?.invalidate(currentUrl);
				}

				await this.performNavigation(new URL(currentUrl, window.location.origin), 'replace');
			},
		});
		this.adoptDocumentOwner(document);

		// Cache the initial page for instant back-navigation
		const initialHtml = document.documentElement.outerHTML;
		this.prefetchManager?.cacheVisitedPage(window.location.href, initialHtml);
	}

	/**
	 * Stops the router and cleans up all event listeners.
	 * After calling this, navigation will fall back to full page reloads.
	 */
	public stop(): void {
		document.removeEventListener('click', this.handleClick);
		window.removeEventListener('popstate', this.handlePopState);
		this.prefetchManager?.stop();
		this.unregisterNavigationRuntime?.();
		this.unregisterNavigationRuntime = null;
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
	 * Manually prefetch a URL.
	 * @param href - The URL to prefetch
	 */
	public async prefetch(href: string): Promise<void> {
		if (!this.prefetchManager) {
			console.warn('[ecopages] Prefetching is disabled. Enable it in router options.');
			return;
		}
		return this.prefetchManager.prefetch(href);
	}

	/**
	 * Intercepts link clicks for client-side navigation.
	 *
	 * Filters out clicks with modifier keys (opens new tab), non-left clicks,
	 * external links, download links, and links with the reload attribute.
	 *
	 * Uses `event.composedPath()` to correctly detect clicks on anchors inside
	 * Shadow DOM boundaries (Web Components).
	 */
	private handleClick(event: MouseEvent): void {
		if (this.isAnotherNavigationRuntimeActive()) return;

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

	/**
	 * Handles browser back/forward navigation.
	 * Triggered by the History API's popstate event.
	 */
	private handlePopState(_event: PopStateEvent): void {
		if (this.isAnotherNavigationRuntimeActive()) return;

		const url = new URL(window.location.href);
		this.performNavigation(url, 'back');
	}

	/**
	 * Checks if a URL shares the same origin as the current page.
	 * Cross-origin navigation always falls back to full page reload.
	 */
	private isSameOrigin(url: URL): boolean {
		return url.origin === window.location.origin;
	}

	/**
	 * Executes the core navigation flow.
	 *
	 * Orchestrates fetching, DOM swapping, and lifecycle events:
	 *
	 * 1. **Fetch** - Retrieves HTML (from cache or network)
	 * 2. **eco:before-swap** - Allows listeners to force a full reload
	 * 3. **History update** - Updates URL before DOM swap so Web Components
	 *    see the correct URL in their `connectedCallback`
	 * 4. **Stylesheet preload** - Prevents FOUC by loading styles first
	 * 5. **DOM swap** - Morphs head/body, optionally with View Transition
	 * 6. **Lifecycle events** - Dispatches `eco:after-swap` and `eco:page-load`
	 *
	 * Falls back to full page reload on network errors.
	 *
	 * @param url - The target URL to navigate to
	 * @param direction - Navigation direction ('forward', 'back', or 'replace')
	 */
	private async performNavigation(url: URL, direction: EcoNavigationEvent['direction']): Promise<void> {
		const previousUrl = new URL(window.location.href);
		const navigationSequence = ++this.navigationSequence;

		this.abortController?.abort();
		const abortController = new AbortController();
		this.abortController = abortController;
		const isStaleNavigation = () =>
			this.navigationSequence !== navigationSequence || abortController.signal.aborted;

		try {
			const navigationRuntime = getEcoNavigationRuntime(window);
			const html = await this.fetchPage(url, abortController.signal);
			if (isStaleNavigation()) return;

			const newDocument = this.domSwapper.parseHTML(html, url);
			if (isStaleNavigation()) return;

			const currentDocumentOwner = navigationRuntime.resolveDocumentOwner(document, 'browser-router');
			const newDocumentOwner = navigationRuntime.resolveDocumentOwner(newDocument, 'browser-router');
			let shouldReload = currentDocumentOwner !== newDocumentOwner;
			const beforeSwapEvent: EcoBeforeSwapEvent = {
				url,
				direction,
				newDocument,
				reload: () => {
					shouldReload = true;
				},
			};

			document.dispatchEvent(new CustomEvent('eco:before-swap', { detail: beforeSwapEvent }));
			if (isStaleNavigation()) return;

			if (shouldReload) {
				if (isStaleNavigation()) return;
				if (currentDocumentOwner !== 'browser-router') {
					await navigationRuntime.cleanupOwner(currentDocumentOwner);
				}
				this.reloadDocument(url);
				return;
			}

			if (isStaleNavigation()) return;

			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			const useViewTransitions = this.options.viewTransitions;
			await this.domSwapper.preloadStylesheets(newDocument);
			if (isStaleNavigation()) return;

			const commitSwap = () => {
				if (isStaleNavigation()) return;

				this.domSwapper.morphHead(newDocument);
				if (useViewTransitions && !this.domSwapper.shouldReplaceBodyForRerunScripts()) {
					this.domSwapper.morphBody(newDocument);
				} else {
					this.domSwapper.replaceBody(newDocument);
				}
				this.domSwapper.flushRerunScripts();
				this.scrollManager.handleScroll(url, previousUrl);
			};

			if (useViewTransitions) {
				await this.viewTransitionManager.transition(commitSwap);
			} else {
				commitSwap();
			}

			if (isStaleNavigation()) return;

			navigationRuntime.adoptDocumentOwner(newDocument, 'browser-router');

			const afterSwapEvent: EcoAfterSwapEvent = {
				url,
				direction,
			};

			document.dispatchEvent(new CustomEvent('eco:after-swap', { detail: afterSwapEvent }));

			this.prefetchManager?.observeNewLinks();

			// Cache the visited page for instant revisits (stale-while-revalidate)
			this.prefetchManager?.cacheVisitedPage(url.href, html);

			requestAnimationFrame(() => {
				if (isStaleNavigation()) return;

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
		} finally {
			if (this.abortController === abortController) {
				this.abortController = null;
			}
		}
	}

	/**
	 * Fetches the HTML content of a page.
	 * @param url - The URL to fetch
	 * @param signal - AbortSignal for cancelling the request
	 * @throws Error if the response is not ok
	 */
	private async fetchPage(url: URL, signal: AbortSignal): Promise<string> {
		if (this.prefetchManager) {
			const cachedHtml = this.prefetchManager.getCachedHtml(url.href);
			if (cachedHtml) {
				return cachedHtml;
			}
		}

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
