/**
 * Client-side router for Ecopages with morphdom-based DOM diffing.
 * @module eco-router
 */

import type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types.ts';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import {
	getAnchorFromNavigationEvent,
	recoverPendingNavigationHref,
	type EcoPendingNavigationIntent,
} from '@ecopages/core/router/link-intent';
import { DEFAULT_OPTIONS } from './types.ts';
import { DomSwapper, ScrollManager, ViewTransitionManager, PrefetchManager } from './services/index.ts';

/**
 * Intercepts same-origin link clicks and performs client-side navigation
 * using morphdom for efficient DOM diffing. Supports View Transitions API.
 */
export class EcoRouter {
	private options: Required<EcoRouterOptions>;
	private unregisterNavigationRuntime: (() => void) | null = null;
	private started = false;
	private pendingNavigations = 0;
	private pendingPointerNavigation: EcoPendingNavigationIntent | null = null;
	private pendingHoverNavigation: EcoPendingNavigationIntent | null = null;
	private queuedNavigationHref: string | null = null;

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
		this.handleHoverIntent = this.handleHoverIntent.bind(this);
		this.handlePointerDown = this.handlePointerDown.bind(this);
		this.handlePopState = this.handlePopState.bind(this);
	}

	private getLinkFromEvent(event: MouseEvent | PointerEvent): HTMLAnchorElement | null {
		return getAnchorFromNavigationEvent(event, this.options.linkSelector);
	}

	private canInterceptLink(event: MouseEvent | PointerEvent, link: HTMLAnchorElement): string | null {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
		if (event.button !== 0) return null;

		const target = link.getAttribute('target');
		if (target && target !== '_self') return null;

		if (link.hasAttribute(this.options.reloadAttribute)) return null;
		if (link.hasAttribute('download')) return null;

		const href = link.getAttribute('href');
		if (!href) return null;

		if (href.startsWith('#')) return null;
		if (href.startsWith('javascript:')) return null;

		const url = new URL(href, window.location.origin);
		if (!this.isSameOrigin(url)) return null;

		return href;
	}

	private getRecoveredPointerHref(): string | null {
		const href = recoverPendingNavigationHref(
			this.pendingPointerNavigation,
			this.pendingNavigations > 0,
			performance.now(),
		);

		if (!href) {
			this.pendingPointerNavigation = null;
		}

		return href;
	}

	private getRecoveredHoverHref(): string | null {
		const href = recoverPendingNavigationHref(
			this.pendingHoverNavigation,
			this.pendingNavigations > 0,
			performance.now(),
		);

		if (!href) {
			this.pendingHoverNavigation = null;
		}

		return href;
	}

	private isAnotherNavigationRuntimeActive(): boolean {
		const ownerState = getEcoNavigationRuntime(window).getOwnerState();
		return (
			ownerState.owner !== 'none' && ownerState.owner !== 'browser-router' && ownerState.canHandleSpaNavigation
		);
	}

	private getDocumentOwner(doc: Document) {
		return getEcoNavigationRuntime(window).resolveDocumentOwner(doc, 'browser-router');
	}

	private adoptDocumentOwner(doc: Document): void {
		getEcoNavigationRuntime(window).adoptDocumentOwner(doc, 'browser-router');
	}

	private syncDocumentElementAttributes(newDocument: Document): void {
		const currentHtml = document.documentElement;
		const nextHtml = newDocument.documentElement;

		for (const attribute of Array.from(currentHtml.attributes)) {
			if (!nextHtml.hasAttribute(attribute.name)) {
				currentHtml.removeAttribute(attribute.name);
			}
		}

		for (const attribute of Array.from(nextHtml.attributes)) {
			if (currentHtml.getAttribute(attribute.name) !== attribute.value) {
				currentHtml.setAttribute(attribute.name, attribute.value);
			}
		}
	}

	private reloadDocument(url: URL): void {
		window.location.assign(url.href);
	}

	/**
	 * Commits a fully fetched document into the live page.
	 *
	 * When browser-router accepts a handoff from another runtime, it delays source
	 * runtime cleanup until the incoming document has been prepared and is ready to
	 * commit. That ordering avoids the blank-page window we previously hit when a
	 * delegated navigation went stale after the source runtime had already torn
	 * itself down.
	 */
	private async commitDocumentNavigation(
		url: URL,
		direction: EcoNavigationEvent['direction'],
		newDocument: Document,
		options: {
			html?: string;
			isStaleNavigation?: () => boolean;
		} = {},
	): Promise<void> {
		const previousUrl = new URL(window.location.href);
		const navigationRuntime = getEcoNavigationRuntime(window);
		const isStaleNavigation = options.isStaleNavigation ?? (() => false);
		const currentDocumentOwner = navigationRuntime.resolveDocumentOwner(document, 'browser-router');
		const newDocumentOwner = navigationRuntime.resolveDocumentOwner(newDocument, 'browser-router');
		const activeOwner = navigationRuntime.getOwnerState().owner;
		const shouldCleanupCurrentOwner =
			currentDocumentOwner !== newDocumentOwner &&
			currentDocumentOwner !== 'browser-router' &&
			activeOwner === currentDocumentOwner;
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
		if (isStaleNavigation()) return;

		if (shouldReload) {
			if (shouldCleanupCurrentOwner) {
				await navigationRuntime.cleanupOwner(currentDocumentOwner);
			}
			if (isStaleNavigation()) return;
			this.reloadDocument(url);
			return;
		}

		const useViewTransitions = this.options.viewTransitions;
		await this.domSwapper.preloadStylesheets(newDocument);
		if (isStaleNavigation()) return;

		// Defer source-runtime cleanup until the incoming document is ready to win.
		if (shouldCleanupCurrentOwner) {
			await navigationRuntime.cleanupOwner(currentDocumentOwner);
		}

		if (isStaleNavigation()) return;

		const commitSwap = () => {
			if (isStaleNavigation()) return;

			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			this.syncDocumentElementAttributes(newDocument);
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

		if (options.html) {
			this.prefetchManager?.cacheVisitedPage(url.href, options.html);
		}

		requestAnimationFrame(() => {
			if (isStaleNavigation()) return;

			document.dispatchEvent(
				new CustomEvent('eco:page-load', {
					detail: { url, direction } as EcoNavigationEvent,
				}),
			);
		});
	}

	/**
	 * Starts the router and begins intercepting navigation.
	 *
	 * Attaches click handlers for links and popstate handlers for browser
	 * back/forward buttons. Also starts the prefetch manager if configured.
	 */
	public start(): void {
		if (this.started) {
			return;
		}

		const navigationRuntime = getEcoNavigationRuntime(window);

		document.addEventListener('mouseover', this.handleHoverIntent, true);
		document.addEventListener('pointerover', this.handleHoverIntent, true);
		document.addEventListener('mousemove', this.handleHoverIntent, true);
		document.addEventListener('pointermove', this.handleHoverIntent, true);
		document.addEventListener('pointerdown', this.handlePointerDown, true);
		document.addEventListener('click', this.handleClick, true);
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
			handoffNavigation: async (request) => {
				const { isStaleNavigation, complete } = this.beginNavigationTransaction();
				if (isStaleNavigation()) return true;
				try {
					await this.commitDocumentNavigation(
						new URL(request.finalHref ?? request.href, window.location.origin),
						request.direction ?? 'forward',
						request.document,
						{ html: request.html, isStaleNavigation },
					);
				} finally {
					complete();
				}
				return true;
			},
			reloadCurrentPage: async (request) => {
				if (this.pendingNavigations > 0) return;

				const currentUrl = window.location.pathname + window.location.search;

				if (request?.clearCache) {
					this.prefetchManager?.invalidate(currentUrl);
				}

				await this.performNavigation(new URL(currentUrl, window.location.origin), 'replace');
			},
			cleanupBeforeHandoff: async () => {
				this.cancelNavigationTransaction();
			},
		});
		this.adoptDocumentOwner(document);

		// Cache the initial page for instant back-navigation
		const initialHtml = document.documentElement.outerHTML;
		this.prefetchManager?.cacheVisitedPage(window.location.href, initialHtml);
		this.started = true;
	}

	/**
	 * Stops the router and cleans up all event listeners.
	 * After calling this, navigation will fall back to full page reloads.
	 */
	public stop(): void {
		if (!this.started) {
			return;
		}

		this.cancelNavigationTransaction();
		document.removeEventListener('mouseover', this.handleHoverIntent, true);
		document.removeEventListener('pointerover', this.handleHoverIntent, true);
		document.removeEventListener('mousemove', this.handleHoverIntent, true);
		document.removeEventListener('pointermove', this.handleHoverIntent, true);
		document.removeEventListener('pointerdown', this.handlePointerDown, true);
		document.removeEventListener('click', this.handleClick, true);
		window.removeEventListener('popstate', this.handlePopState);
		this.prefetchManager?.stop();
		this.unregisterNavigationRuntime?.();
		this.unregisterNavigationRuntime = null;
		this.started = false;
		this.pendingHoverNavigation = null;
		this.pendingPointerNavigation = null;
		this.queuedNavigationHref = null;

		const win = window as RouterWindow;
		if (win[ACTIVE_ROUTER_KEY] === this) {
			delete win[ACTIVE_ROUTER_KEY];
		}
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
	private handlePointerDown(event: PointerEvent): void {
		const link = this.getLinkFromEvent(event);
		if (!link) {
			this.pendingPointerNavigation = null;
			return;
		}

		const href = this.canInterceptLink(event, link);
		this.pendingPointerNavigation = href
			? {
					href,
					timestamp: performance.now(),
				}
			: null;

		if (href && this.pendingNavigations > 0) {
			this.queuedNavigationHref = href;
		}
	}

	private handleHoverIntent(event: MouseEvent | PointerEvent): void {
		const link = this.getLinkFromEvent(event);
		if (!link) {
			return;
		}

		const href = this.canInterceptLink(event, link);
		if (!href) {
			return;
		}

		this.pendingHoverNavigation = {
			href,
			timestamp: performance.now(),
		};

		if (this.pendingNavigations > 0) {
			this.queuedNavigationHref = href;
		}
	}

	private handleClick(event: MouseEvent): void {
		const navigationRuntime = getEcoNavigationRuntime(window);
		const link = this.getLinkFromEvent(event);
		const href = link
			? this.canInterceptLink(event, link)
			: (this.getRecoveredPointerHref() ?? this.getRecoveredHoverHref());
		this.pendingPointerNavigation = null;
		this.pendingHoverNavigation = null;
		if (!href) return;
		this.queuedNavigationHref = null;

		if (this.isAnotherNavigationRuntimeActive()) {
			event.preventDefault();
			event.stopImmediatePropagation();
			void navigationRuntime.requestNavigation({
				href,
				direction: 'forward',
				source: 'browser-router',
			});
			return;
		}

		const url = new URL(href, window.location.origin);

		event.preventDefault();
		if (this.pendingNavigations > 0) {
			this.queuedNavigationHref = href;
			this.cancelNavigationTransaction();
			return;
		}
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

	private cancelNavigationTransaction(): void {
		getEcoNavigationRuntime(window).cancelCurrentNavigationTransaction();
	}

	private beginNavigationTransaction(): {
		isStaleNavigation: () => boolean;
		signal: AbortSignal;
		complete: () => void;
	} {
		const transaction = getEcoNavigationRuntime(window).beginNavigationTransaction();
		return {
			isStaleNavigation: () => !transaction.isCurrent(),
			signal: transaction.signal,
			complete: () => transaction.complete(),
		};
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
		this.pendingNavigations++;
		const { isStaleNavigation, signal, complete } = this.beginNavigationTransaction();
		let queuedNavigationHref: string | null = null;

		try {
			const html = await this.fetchPage(url, signal);
			if (isStaleNavigation()) return;

			const newDocument = this.domSwapper.parseHTML(html, url);
			if (isStaleNavigation()) return;

			await this.commitDocumentNavigation(url, direction, newDocument, {
				html,
				isStaleNavigation,
			});
		} catch (error) {
			if (isStaleNavigation()) return;

			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			console.error('[ecopages] Navigation failed:', error);
			window.location.href = url.href;
		} finally {
			complete();
			this.pendingNavigations--;

			const navigationRuntime = getEcoNavigationRuntime(window);
			if (!navigationRuntime.hasPendingNavigationTransaction()) {
				queuedNavigationHref = this.queuedNavigationHref;
				this.queuedNavigationHref = null;
			}

			if (queuedNavigationHref && queuedNavigationHref !== window.location.pathname + window.location.search) {
				const ownerState = navigationRuntime.getOwnerState();

				if (
					ownerState.owner !== 'none' &&
					ownerState.owner !== 'browser-router' &&
					ownerState.canHandleSpaNavigation
				) {
					void navigationRuntime.requestNavigation({
						href: queuedNavigationHref,
						direction: 'forward',
						source: 'browser-router',
					});
				} else {
					void this.performNavigation(new URL(queuedNavigationHref, window.location.origin), 'forward');
				}
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

const ACTIVE_ROUTER_KEY = '__ecopages_browser_router__';

type RouterWindow = Window &
	typeof globalThis & {
		[ACTIVE_ROUTER_KEY]?: EcoRouter;
	};

/**
 * Creates and starts a router instance.
 *
 * Stops the previously active router (if any) before creating a new one so
 * click listeners and coordinator registrations from earlier instances are
 * cleaned up on re-execution (e.g. when the layout script is re-run via
 * `data-eco-rerun` after a browser-router page commit).
 *
 * @param options - Configuration options for the router
 * @returns A started EcoRouter instance
 */
export function createRouter(options?: EcoRouterOptions): EcoRouter {
	const win = window as RouterWindow;
	const existingRouter = win[ACTIVE_ROUTER_KEY];
	if (existingRouter) {
		return existingRouter;
	}
	const router = new EcoRouter(options);
	win[ACTIVE_ROUTER_KEY] = router;
	router.start();
	return router;
}

export type { EcoRouterOptions, EcoNavigationEvent, EcoBeforeSwapEvent, EcoAfterSwapEvent } from './types';
