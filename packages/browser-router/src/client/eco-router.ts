/**
 * Client-side router for Ecopages with morphdom-based DOM diffing.
 * @module eco-router
 */

import type { EcoNavigationEvent } from '@ecopages/core/router/navigation-lifecycle';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import {
	getAnchorFromNavigationEvent,
	isStaticAssetHref,
	recoverPendingNavigationHref,
	type EcoPendingNavigationIntent,
} from '@ecopages/core/router/link-intent';
import { getNavigableHrefFromClick } from '@ecopages/core/router/link-navigation-policy';
import { DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC, DEFAULT_OPTIONS, type EcoRouterOptions } from './types.ts';
import { DomSwapper } from './dom/dom-swapper.ts';
import { PrefetchManager } from './services/prefetch-manager.ts';
import { ViewTransitionManager } from './services/view-transition-manager.ts';
import { NavigationCommit } from './navigation-commit.ts';
import { fetchNavigationPage } from './navigation-fetch.ts';

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
	private queuedNavigationHref: string | null = null;

	private domSwapper: DomSwapper;
	private viewTransitionManager: ViewTransitionManager;
	private prefetchManager: PrefetchManager | null = null;
	private readonly navigationCommit: NavigationCommit;

	constructor(options: EcoRouterOptions = {}) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options,
			documentElementAttributesToSync: [
				...(options.documentElementAttributesToSync ?? DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC),
			],
		};

		this.domSwapper = new DomSwapper(this.options.persistAttribute);
		this.viewTransitionManager = new ViewTransitionManager(this.options.viewTransitions);

		if (this.options.prefetch !== false) {
			this.prefetchManager = new PrefetchManager({
				...this.options.prefetch,
				linkSelector: this.options.linkSelector,
			});
		}

		this.handleClick = this.handleClick.bind(this);
		this.handlePointerDown = this.handlePointerDown.bind(this);
		this.handlePopState = this.handlePopState.bind(this);

		this.navigationCommit = new NavigationCommit(
			this.domSwapper,
			this.viewTransitionManager,
			this.prefetchManager,
			this.options,
		);
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

	private isAnotherNavigationRuntimeActive(): boolean {
		const ownerState = getEcoNavigationRuntime(window).getOwnerState();
		return (
			ownerState.owner !== 'none' && ownerState.owner !== 'browser-router' && ownerState.canHandleSpaNavigation
		);
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
		navigationRuntime.cancelCurrentNavigationTransaction();
		this.pendingNavigations = 0;
		this.queuedNavigationHref = null;
		this.pendingPointerNavigation = null;

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
					await this.navigationCommit.commit(
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
				if (this.pendingNavigations > 0) {
					return false;
				}

				const currentUrl = window.location.pathname + window.location.search;

				if (request?.clearCache) {
					this.prefetchManager?.invalidate(currentUrl);
				}

				return await this.performNavigation(new URL(currentUrl, window.location.origin), 'replace', {
					bypassPrefetchCache: !!request?.clearCache,
					allowFullDocumentFallback: false,
				});
			},
			cleanupBeforeHandoff: async () => {
				this.cancelNavigationTransaction();
			},
		});
		getEcoNavigationRuntime(window).adoptDocumentOwner(document, 'browser-router');

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
		document.removeEventListener('pointerdown', this.handlePointerDown, true);
		document.removeEventListener('click', this.handleClick, true);
		window.removeEventListener('popstate', this.handlePopState);
		this.prefetchManager?.stop();
		this.unregisterNavigationRuntime?.();
		this.unregisterNavigationRuntime = null;
		this.started = false;
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

		if (url.origin !== window.location.origin) {
			window.location.href = href;
			return;
		}

		if (isStaticAssetHref(href)) {
			window.location.assign(url.href);
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
		const link = getAnchorFromNavigationEvent(event, this.options.linkSelector);
		if (!link) {
			this.pendingPointerNavigation = null;
			return;
		}

		const href = getNavigableHrefFromClick(event, link, { reloadAttribute: this.options.reloadAttribute });
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

	private handleClick(event: MouseEvent): void {
		const navigationRuntime = getEcoNavigationRuntime(window);
		const link = getAnchorFromNavigationEvent(event, this.options.linkSelector);
		const href = link
			? getNavigableHrefFromClick(event, link, { reloadAttribute: this.options.reloadAttribute })
			: this.getRecoveredPointerHref();
		this.pendingPointerNavigation = null;
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
	private async performNavigation(
		url: URL,
		direction: EcoNavigationEvent['direction'],
		options: { bypassPrefetchCache?: boolean; allowFullDocumentFallback?: boolean } = {},
	): Promise<boolean> {
		const allowFullDocumentFallback = options.allowFullDocumentFallback ?? true;
		this.pendingNavigations++;
		const { isStaleNavigation, signal, complete } = this.beginNavigationTransaction();
		let queuedNavigationHref: string | null = null;
		let committed = false;

		try {
			const html = await fetchNavigationPage(url, signal, {
				bypassCache: options.bypassPrefetchCache,
				getCachedHtml: this.prefetchManager ? (href) => this.prefetchManager!.getCachedHtml(href) : undefined,
			});
			if (isStaleNavigation()) {
				return false;
			}

			const newDocument = this.domSwapper.parseHTML(html, url);
			if (isStaleNavigation()) {
				return false;
			}

			committed = await this.navigationCommit.commit(url, direction, newDocument, {
				html,
				isStaleNavigation,
				allowFullDocumentFallback,
			});
			return committed;
		} catch (error) {
			if (isStaleNavigation()) {
				return false;
			}

			if (error instanceof Error && error.name === 'AbortError') {
				return false;
			}

			console.error('[ecopages] Navigation failed:', error);
			if (allowFullDocumentFallback) {
				window.location.href = url.href;
			}
			return false;
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
