/**
 * Prefetch manager for client-side navigation.
 * Uses a single IntersectionObserver and hover detection for optimal performance.
 * @module prefetch-manager
 */

import { fetchNavigationPage, invalidateNavigationHtml } from '@ecopages/core/client';
import { isSamePageHref, shouldPrefetchLink } from '@ecopages/core/client';
import { discoverPriorityImages, warmPriorityImage } from '../dom/image-discovery.ts';
import { discoverNewStylesheetLinks, getCurrentStylesheetHrefs } from '../dom/stylesheet-discovery.ts';

export type PrefetchStrategy = 'viewport' | 'hover' | 'intent';

export interface PrefetchOptions {
	strategy: PrefetchStrategy;
	delay: number;
	reloadAttribute: string;
	noPrefetchAttribute: string;
	respectDataSaver: boolean;
	images: boolean;
	linkSelector: string;
}

const DEFAULT_PREFETCH_OPTIONS: PrefetchOptions = {
	strategy: 'intent',
	delay: 65,
	reloadAttribute: 'data-eco-reload',
	noPrefetchAttribute: 'data-eco-no-prefetch',
	respectDataSaver: true,
	images: true,
	linkSelector: 'a[href]',
};

/**
 * Most images warmed for one prefetched page.
 *
 * @remarks
 * `fetchpriority="high"` is for the image the first paint waits for, so one is the usual case. Two leaves room
 * for a head preload that names another image than the body's, such as a hero and the logo above it, while a
 * page that marks many images cannot turn one prefetch into a download of its gallery.
 */
const MAX_PREFETCH_IMAGES = 2;

export class PrefetchManager {
	private options: PrefetchOptions;
	private prefetched: Set<string> = new Set();
	private prefetchedStylesheets: Set<string> = new Set();
	private prefetchedImages: Set<string> = new Set();
	private observer: IntersectionObserver | null = null;
	private hoverTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(options: Partial<PrefetchOptions>) {
		this.options = { ...DEFAULT_PREFETCH_OPTIONS, ...options };
	}

	/**
	 * Initializes prefetching based on the configured strategy.
	 *
	 * Sets up IntersectionObserver for viewport-based prefetching and/or
	 * hover/focus listeners for intent-based prefetching. Immediately begins
	 * observing existing links on the page.
	 */
	start(): void {
		if (!this.shouldPrefetch()) return;

		if (this.options.strategy === 'viewport' || this.options.strategy === 'intent') {
			this.setupIntersectionObserver();
		}

		if (this.options.strategy === 'hover' || this.options.strategy === 'intent') {
			this.setupHoverListeners();
		}

		this.observeLinks();
	}

	/**
	 * Cleans up all prefetch-related observers and event listeners.
	 * Cancels any pending hover timeouts.
	 */
	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
		document.removeEventListener('mouseover', this.handleMouseOver);
		document.removeEventListener('mouseout', this.handleMouseOut);
		document.removeEventListener('focusin', this.handleFocusIn);
		document.removeEventListener('focusout', this.handleFocusOut);
		this.hoverTimeouts.forEach((timeout) => clearTimeout(timeout));
		this.hoverTimeouts.clear();
	}

	/**
	 * Fetches and caches HTML content for a given URL.
	 *
	 * Skips cross-origin URLs or already-prefetched URLs. On success, both the
	 * HTML content is cached and any new stylesheets are preloaded to prevent
	 * FOUC during navigation. Unless `images` is off, the page's high-priority
	 * images are warmed too.
	 *
	 * @param href - The URL to prefetch
	 */
	async prefetch(href: string): Promise<void> {
		const url = new URL(href, window.location.origin);

		if (url.origin !== window.location.origin) return;
		if (this.prefetched.has(url.href)) return;

		if (isSamePageHref(url.href)) return;

		this.prefetched.add(url.href);

		try {
			const page = await fetchNavigationPage(url, { priority: 'low' });
			if (!page) {
				this.prefetched.delete(url.href);
				return;
			}

			if (this.options.images && this.shouldPrefetch()) this.prefetchImages(page.document);
			await this.prefetchStylesheets(page.document);
		} catch {
			this.prefetched.delete(url.href);
		}
	}

	invalidate(href: string): void {
		const url = new URL(href, window.location.origin);
		invalidateNavigationHtml(url);
		this.prefetched.delete(url.href);
	}

	/**
	 * Records that the router navigated to a page, so a link to it is not prefetched again.
	 *
	 * @remarks
	 * The page's HTML is already in the navigation cache when its response allowed reuse, because the fetch
	 * that loaded it stored it; a `no-store` page stays out, so a revisit fetches it. The document the router
	 * started on is not stored at all: a page script cannot read the response headers of its own document,
	 * so that copy could not be told from a `no-store` page. The first return to it fetches it.
	 *
	 * @param href - The URL of the visited page
	 */
	markVisited(href: string): void {
		const url = new URL(href, window.location.origin);
		if (url.origin !== window.location.origin) return;

		this.prefetched.add(url.href);
	}

	/**
	 * Determines if prefetching should be enabled based on network conditions.
	 *
	 * Respects the user's data saver settings and avoids prefetching on slow
	 * connections (2g or slower) when `respectDataSaver` is enabled.
	 */
	private shouldPrefetch(): boolean {
		if (!this.options.respectDataSaver) return true;

		const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
		if (!conn) return true;
		if (conn.saveData) return false;
		if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false;

		return true;
	}

	/**
	 * Creates an IntersectionObserver to prefetch links as they enter the viewport.
	 *
	 * Uses a 50px root margin to trigger prefetching slightly before elements
	 * become visible, improving perceived performance.
	 */
	private setupIntersectionObserver(): void {
		this.observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const link = entry.target as HTMLAnchorElement;
						if (!this.isEligiblePrefetchLink(link)) continue;
						const strategy = this.getLinkStrategy(link);
						if (strategy === 'viewport' || strategy === 'eager') {
							this.scheduleIdlePrefetch(link.href, strategy === 'eager');
						}
					}
				}
			},
			{ rootMargin: '50px', threshold: 0 },
		);
	}

	/**
	 * Attaches delegated event listeners for hover and focus-based prefetching.
	 *
	 * Uses event delegation on the document for efficient handling without
	 * attaching listeners to individual links.
	 */
	private setupHoverListeners(): void {
		document.addEventListener('mouseover', this.handleMouseOver);
		document.addEventListener('mouseout', this.handleMouseOut);
		document.addEventListener('focusin', this.handleFocusIn);
		document.addEventListener('focusout', this.handleFocusOut);
	}

	private handleMouseOver = (event: MouseEvent): void => {
		const link = this.getLinkFromEvent(event);
		if (!link) return;

		const strategy = this.getLinkStrategy(link);
		if (strategy === 'hover' || strategy === 'intent' || strategy === 'eager') {
			const delay = strategy === 'eager' ? 0 : this.getLinkDelay(link);
			this.scheduleHoverPrefetch(link.href, delay);
		}
	};

	private handleMouseOut = (event: MouseEvent): void => {
		const link = this.getLinkFromEvent(event);
		if (!link) return;
		this.cancelHoverPrefetch(link.href);
	};

	private handleFocusIn = (event: FocusEvent): void => {
		const link = this.getLinkFromEvent(event);
		if (!link) return;

		const strategy = this.getLinkStrategy(link);
		if (strategy === 'hover' || strategy === 'intent' || strategy === 'eager') {
			const delay = strategy === 'eager' ? 0 : this.getLinkDelay(link);
			this.scheduleHoverPrefetch(link.href, delay);
		}
	};

	private handleFocusOut = (event: FocusEvent): void => {
		const link = this.getLinkFromEvent(event);
		if (!link) return;
		this.cancelHoverPrefetch(link.href);
	};

	/**
	 * Extracts a valid anchor element from a DOM event.
	 *
	 * Returns null for links that should not be prefetched (opt-outs, downloads,
	 * hash links, javascript: URLs).
	 */
	private getLinkFromEvent(event: Event): HTMLAnchorElement | null {
		const target = event.target as Element;
		const link = target.closest(this.options.linkSelector) as HTMLAnchorElement | null;

		if (!link) return null;
		if (!this.isEligiblePrefetchLink(link)) {
			return null;
		}

		return link;
	}

	private isEligiblePrefetchLink(link: HTMLAnchorElement): boolean {
		return shouldPrefetchLink(link, {
			reloadAttribute: this.options.reloadAttribute,
			noPrefetchAttribute: this.options.noPrefetchAttribute,
		});
	}

	/**
	 * Resolves the prefetch strategy for a link element.
	 *
	 * Checks for per-link overrides via `data-eco-prefetch` attribute,
	 * falling back to the global strategy.
	 */
	private getLinkStrategy(link: HTMLAnchorElement): PrefetchStrategy | 'eager' | null {
		const override = link.getAttribute('data-eco-prefetch');
		if (override === 'eager' || override === 'viewport' || override === 'hover' || override === 'intent') {
			return override;
		}
		return this.options.strategy;
	}

	/**
	 * Resolves the prefetch delay for a link element.
	 *
	 * Checks for per-link overrides via `data-eco-prefetch-delay` attribute,
	 * falling back to the global delay.
	 */
	private getLinkDelay(link: HTMLAnchorElement): number {
		const delayAttr = link.getAttribute('data-eco-prefetch-delay');
		if (delayAttr) {
			const delay = parseInt(delayAttr, 10);
			if (!isNaN(delay) && delay >= 0) return delay;
		}
		return this.options.delay;
	}

	/**
	 * Schedules a prefetch request during browser idle time.
	 *
	 * Uses `requestIdleCallback` when available for non-blocking execution.
	 * Eager prefetches execute immediately.
	 *
	 * @param href - The URL to prefetch
	 * @param eager - If true, prefetch immediately without waiting for idle
	 */
	private scheduleIdlePrefetch(href: string, eager: boolean = false): void {
		if (this.prefetched.has(href)) return;

		const prefetch = () => this.prefetch(href);

		if (eager) {
			prefetch();
			return;
		}

		if ('requestIdleCallback' in window) {
			requestIdleCallback(prefetch, { timeout: 2000 });
		} else {
			setTimeout(prefetch, 0);
		}
	}

	/**
	 * Schedules a prefetch after a hover delay.
	 *
	 * The delay prevents prefetching when users briefly pass over links
	 * without intent to navigate.
	 *
	 * @param href - The URL to prefetch
	 * @param delay - Milliseconds to wait before prefetching
	 */
	private scheduleHoverPrefetch(href: string, delay: number = this.options.delay): void {
		if (this.prefetched.has(href)) return;
		if (this.hoverTimeouts.has(href)) return;

		const timeout = setTimeout(() => {
			this.hoverTimeouts.delete(href);
			this.prefetch(href);
		}, delay);

		this.hoverTimeouts.set(href, timeout);
	}

	/**
	 * Cancels a pending hover-initiated prefetch.
	 * @param href - The URL whose prefetch should be cancelled
	 */
	private cancelHoverPrefetch(href: string): void {
		const timeout = this.hoverTimeouts.get(href);
		if (timeout) {
			clearTimeout(timeout);
			this.hoverTimeouts.delete(href);
		}
	}

	/**
	 * Observes links for prefetching within `root`.
	 */
	observeLinks(root: Element | Document = document): void {
		const links = root.querySelectorAll<HTMLAnchorElement>(this.options.linkSelector);
		for (const link of links) {
			if (!this.isEligiblePrefetchLink(link)) continue;

			const strategy = this.getLinkStrategy(link);

			if (strategy === 'eager') {
				this.scheduleIdlePrefetch(link.href, true);
			} else if (this.observer && strategy === 'viewport') {
				this.observer.observe(link);
			}
		}
	}

	/**
	 * Prefetches stylesheets discovered in HTML content.
	 *
	 * Parses the HTML to find stylesheet links, then warms the HTTP cache for
	 * stylesheets not already present in the current document. This keeps future
	 * navigation CSS warm without injecting `preload` hints that browsers expect
	 * the current page to consume immediately.
	 *
	 * @param html - The raw HTML string to parse
	 * @param url - The base URL for resolving relative stylesheet paths
	 */
	private async prefetchStylesheets(doc: Document): Promise<void> {
		const existingHrefs = new Set([...getCurrentStylesheetHrefs(), ...this.prefetchedStylesheets]);
		const newStylesheetHrefs = discoverNewStylesheetLinks(doc, existingHrefs).map((link) => link.href);
		const stylesheetFetches = newStylesheetHrefs.map((href) => {
			this.prefetchedStylesheets.add(href);
			return this.prefetchStylesheet(href);
		});

		await Promise.allSettled(stylesheetFetches);
	}

	/**
	 * Warms the images the prefetched page marks as critical, so its largest element does not start loading
	 * after the click.
	 *
	 * @remarks
	 * Runs inside {@link prefetch}, so it follows a page prefetch wherever it comes from: a hover, a focus, a
	 * viewport entry, an eager link or `router.prefetch()`. Those paths differ in how they check the data-saver
	 * setting, so the caller checks it again here. The images are the page's own `fetchpriority="high"` images
	 * and image preloads, at most {@link MAX_PREFETCH_IMAGES}, requested at low priority and once each, unless
	 * a load fails. They are not added to the document, so the browser has nothing to warn about as unused.
	 * `srcset`, `sizes` and `<picture>` sources are kept, so the candidate warmed is the one this device will
	 * pick.
	 */
	private prefetchImages(doc: Document): void {
		for (const image of discoverPriorityImages(doc, MAX_PREFETCH_IMAGES)) {
			if (this.prefetchedImages.has(image.key)) continue;
			this.prefetchedImages.add(image.key);
			warmPriorityImage(image).catch(() => this.prefetchedImages.delete(image.key));
		}
	}

	private async prefetchStylesheet(href: string): Promise<void> {
		try {
			await fetch(href, {
				credentials: 'same-origin',
				priority: 'low',
			} as RequestInit);
		} catch {
			this.prefetchedStylesheets.delete(href);
		}
	}
}

interface NetworkInformation {
	saveData?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}
