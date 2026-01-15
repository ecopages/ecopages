/**
 * Prefetch manager for client-side navigation.
 * Uses a single IntersectionObserver and hover detection for optimal performance.
 * @module prefetch-manager
 */

export type PrefetchStrategy = 'viewport' | 'hover' | 'intent';

export interface PrefetchOptions {
	strategy: PrefetchStrategy;
	delay: number;
	noPrefetchAttribute: string;
	respectDataSaver: boolean;
	linkSelector: string;
}

const DEFAULT_PREFETCH_OPTIONS: PrefetchOptions = {
	strategy: 'intent',
	delay: 65,
	noPrefetchAttribute: 'data-eco-no-prefetch',
	respectDataSaver: true,
	linkSelector: 'a[href]',
};

export class PrefetchManager {
	private options: PrefetchOptions;
	private prefetched: Set<string> = new Set();
	private htmlCache: Map<string, string> = new Map();
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

		this.observeExistingLinks();
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
	 * FOUC during navigation.
	 *
	 * @param href - The URL to prefetch
	 */
	async prefetch(href: string): Promise<void> {
		const url = new URL(href, window.location.origin);

		if (url.origin !== window.location.origin) return;
		if (this.prefetched.has(url.href)) return;

		this.prefetched.add(url.href);

		try {
			const response = await fetch(url.href, {
				headers: { Accept: 'text/html' },
				priority: 'low',
			} as RequestInit);

			if (!response.ok) return;

			const html = await response.text();

			this.htmlCache.set(url.href, html);
			await this.prefetchStylesheets(html, url);
		} catch {
			this.prefetched.delete(url.href);
		}
	}

	/**
	 * Retrieves and removes cached HTML for a URL.
	 *
	 * Uses consume-on-read pattern to prevent stale cache entries.
	 *
	 * @param href - The URL to look up
	 * @returns The cached HTML string, or null if not cached
	 */
	getCachedHtml(href: string): string | null {
		const url = new URL(href, window.location.origin);
		const html = this.htmlCache.get(url.href);
		if (html) {
			this.htmlCache.delete(url.href);
			return html;
		}
		return null;
	}

	/**
	 * Checks if a URL has already been prefetched.
	 * @param href - The URL to check
	 */
	isPrefetched(href: string): boolean {
		const url = new URL(href, window.location.origin);
		return this.prefetched.has(url.href);
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
		if (link.hasAttribute(this.options.noPrefetchAttribute)) return null;
		if (link.hasAttribute('download')) return null;

		const href = link.getAttribute('href');
		if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;

		return link;
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
	 * Begins observing all existing links on the page.
	 *
	 * Called once during initialization. Eager links are prefetched immediately;
	 * viewport-strategy links are registered with the IntersectionObserver.
	 */
	private observeExistingLinks(): void {
		const links = document.querySelectorAll<HTMLAnchorElement>(this.options.linkSelector);
		for (const link of links) {
			if (link.hasAttribute(this.options.noPrefetchAttribute)) continue;

			const strategy = this.getLinkStrategy(link);

			if (strategy === 'eager') {
				this.scheduleIdlePrefetch(link.href, true);
			} else if (this.observer && strategy === 'viewport') {
				this.observer.observe(link);
			}
		}
	}

	/**
	 * Observes newly added links after DOM mutations.
	 *
	 * Should be called after client-side navigation or dynamic content updates
	 * to ensure new links are tracked for prefetching.
	 *
	 * @param root - The root element to search for links (defaults to document)
	 */
	observeNewLinks(root: Element | Document = document): void {
		const links = root.querySelectorAll<HTMLAnchorElement>(this.options.linkSelector);
		for (const link of links) {
			if (link.hasAttribute(this.options.noPrefetchAttribute)) continue;

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
	 * Parses the HTML to find stylesheet links, then creates preload hints
	 * for stylesheets not already present in the current document. This ensures
	 * styles are cached before navigation to prevent FOUC.
	 *
	 * @param html - The raw HTML string to parse
	 * @param url - The base URL for resolving relative stylesheet paths
	 */
	private async prefetchStylesheets(html: string, url: URL): Promise<void> {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<base href="${url.href}">${html}`, 'text/html');

		const existingHrefs = new Set([
			...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href),
			...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="style"]')).map(
				(l) => l.href,
			),
		]);

		const newStylesheets = doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');

		for (const link of newStylesheets) {
			if (!existingHrefs.has(link.href)) {
				const preloadLink = document.createElement('link');
				preloadLink.rel = 'preload';
				preloadLink.as = 'style';
				preloadLink.href = link.href;

				document.head.appendChild(preloadLink);
			}
		}
	}
}

interface NetworkInformation {
	saveData?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}
