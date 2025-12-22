/**
 * Client-side router for Ecopages
 * Intercepts link clicks and performs client-side navigation
 * @module
 */

/**
 * Configuration options for the EcoRouter
 */
interface EcoRouterOptions {
	/** Selector for links to intercept. @default 'a[href]' */
	linkSelector?: string;
	/** Attribute to mark elements for DOM persistence. @default 'data-eco-persist' */
	persistAttribute?: string;
	/** Attribute to force full page reload. @default 'data-eco-reload' */
	reloadAttribute?: string;
	/** Attribute to mark elements for scroll position persistence. @default 'data-eco-scroll-persist' */
	scrollPersistAttribute?: string;
	/** Whether to update browser history. @default true */
	updateHistory?: boolean;
	/**
	 * Scroll behavior after navigation:
	 * - 'top': Always scroll to top (default)
	 * - 'preserve': Keep current scroll position
	 * - 'auto': Scroll to top only when pathname changes
	 */
	scrollBehavior?: 'top' | 'preserve' | 'auto';
}

/** Events emitted during the navigation lifecycle */
interface EcoNavigationEvent {
	url: URL;
	direction: 'forward' | 'back' | 'replace';
}

/** Event fired before the DOM swap occurs */
interface EcoBeforeSwapEvent extends EcoNavigationEvent {
	newDocument: Document;
	reload: () => void;
}

/** Event fired after the DOM swap completes */
interface EcoAfterSwapEvent extends EcoNavigationEvent {
	persistedElements: Map<string, Element>;
}

const DEFAULT_OPTIONS: Required<EcoRouterOptions> = {
	linkSelector: 'a[href]',
	persistAttribute: 'data-eco-persist',
	reloadAttribute: 'data-eco-reload',
	scrollPersistAttribute: 'data-eco-scroll-persist',
	updateHistory: true,
	scrollBehavior: 'top',
};

/**
 * EcoRouter provides client-side navigation for Ecopages.
 * Intercepts same-origin link clicks and swaps page content without full reloads.
 */
export class EcoRouter {
	private options: Required<EcoRouterOptions>;
	private abortController: AbortController | null = null;

	constructor(options: EcoRouterOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Initialize the router and start intercepting navigation
	 */
	start(): void {
		document.addEventListener('click', this.handleClick.bind(this));
		window.addEventListener('popstate', this.handlePopState.bind(this));
	}

	/**
	 * Stop the router and remove event listeners
	 */
	stop(): void {
		document.removeEventListener('click', this.handleClick.bind(this));
		window.removeEventListener('popstate', this.handlePopState.bind(this));
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
		// Find the closest anchor element
		const link = (event.target as Element).closest(this.options.linkSelector) as HTMLAnchorElement | null;

		if (!link) return;

		// Skip if modifier keys are pressed (new tab, etc.)
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

		// Skip if not left click
		if (event.button !== 0) return;

		// Skip if link has target attribute (except _self)
		const target = link.getAttribute('target');
		if (target && target !== '_self') return;

		// Skip if marked for full reload
		if (link.hasAttribute(this.options.reloadAttribute)) return;

		// Skip if download attribute is present
		if (link.hasAttribute('download')) return;

		const href = link.getAttribute('href');
		if (!href) return;

		// Skip hash-only links
		if (href.startsWith('#')) return;

		// Skip javascript: links
		if (href.startsWith('javascript:')) return;

		const url = new URL(href, window.location.origin);

		// Skip external links
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
		// Cancel any in-flight navigation
		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const html = await this.fetchPage(url, this.abortController.signal);
			const newDocument = this.parseHTML(html);

			// Create before-swap event
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

			/** Collect persisted elements before swap */
			const persistedElements = this.collectPersistedElements();

			/** Save scroll positions of marked elements before swap */
			const savedScrollPositions = this.saveScrollPositions();

			/**
			 * Update history BEFORE swapping DOM.
			 * This ensures web components can read the correct URL in connectedCallback.
			 */
			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			/** Perform the DOM swap */
			this.swapDOM(newDocument, persistedElements, savedScrollPositions, url, previousUrl);

			// Fire after-swap event
			const afterSwapEvent: EcoAfterSwapEvent = {
				url,
				direction,
				persistedElements,
			};

			document.dispatchEvent(new CustomEvent('eco:after-swap', { detail: afterSwapEvent }));

			// Fire page-load event (after scripts execute)
			requestAnimationFrame(() => {
				document.dispatchEvent(
					new CustomEvent('eco:page-load', {
						detail: { url, direction } as EcoNavigationEvent,
					}),
				);
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				// Navigation was cancelled, ignore
				return;
			}

			console.error('[ecopages] Navigation failed:', error);
			// Fall back to full page load
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

	/**
	 * Parse HTML string into a Document
	 */
	private parseHTML(html: string): Document {
		const parser = new DOMParser();
		return parser.parseFromString(html, 'text/html');
	}

	/**
	 * Collect elements marked for persistence
	 */
	private collectPersistedElements(): Map<string, Element> {
		const elements = new Map<string, Element>();
		const selector = `[${this.options.persistAttribute}]`;

		for (const element of document.querySelectorAll(selector)) {
			const id = element.getAttribute(this.options.persistAttribute);
			if (id) {
				elements.set(id, element);
			}
		}

		return elements;
	}

	/**
	 * Swap the current document with the new one.
	 * Handles head merging, body replacement, element/scroll restoration, and scroll behavior.
	 */
	private swapDOM(
		newDocument: Document,
		persistedElements: Map<string, Element>,
		savedScrollPositions: Map<string, number>,
		newUrl: URL,
		previousUrl: URL,
	): void {
		this.mergeHead(newDocument.head);
		document.body.replaceWith(newDocument.body.cloneNode(true) as HTMLBodyElement);
		this.restorePersistedElements(persistedElements);
		this.restoreScrollPositions(savedScrollPositions);
		this.handleScroll(newUrl, previousUrl);
	}

	/**
	 * Save scroll positions of elements marked with scrollPersistAttribute.
	 * @returns Map of element IDs to their scrollTop values
	 */
	private saveScrollPositions(): Map<string, number> {
		const positions = new Map<string, number>();
		const selector = `[${this.options.scrollPersistAttribute}]`;

		for (const element of document.querySelectorAll(selector)) {
			const id = element.getAttribute(this.options.scrollPersistAttribute);
			if (id) {
				positions.set(id, element.scrollTop);
			}
		}

		return positions;
	}

	/**
	 * Restore scroll positions to elements marked with scrollPersistAttribute.
	 * @param positions - Map of element IDs to scrollTop values
	 */
	private restoreScrollPositions(positions: Map<string, number>): void {
		for (const [id, scrollTop] of positions) {
			const element = document.querySelector(`[${this.options.scrollPersistAttribute}="${id}"]`);
			if (element) {
				element.scrollTop = scrollTop;
			}
		}
	}

	/**
	 * Handle scroll position based on scrollBehavior option.
	 * Hash links always scroll to target regardless of option.
	 */
	private handleScroll(newUrl: URL, previousUrl: URL): void {
		if (newUrl.hash) {
			const target = document.querySelector(newUrl.hash);
			target?.scrollIntoView();
			return;
		}

		switch (this.options.scrollBehavior) {
			case 'preserve':
				break;
			case 'auto':
				if (newUrl.pathname !== previousUrl.pathname) {
					window.scrollTo(0, 0);
				}
				break;
			case 'top':
			default:
				window.scrollTo(0, 0);
				break;
		}
	}

	/**
	 * Merge new head with existing head, preserving stylesheets and scripts
	 */
	private mergeHead(newHead: HTMLHeadElement): void {
		const currentHead = document.head;

		// Get all current stylesheets and scripts by href/src
		const currentStyles = new Set(
			Array.from(currentHead.querySelectorAll('link[rel="stylesheet"]')).map(
				(el) => (el as HTMLLinkElement).href,
			),
		);

		const currentScripts = new Set(
			Array.from(currentHead.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src),
		);

		// Remove elements that don't exist in new head (except styles/scripts)
		const toRemove: Element[] = [];
		for (const child of currentHead.children) {
			const tagName = child.tagName.toLowerCase();

			// Always keep stylesheets and scripts that are in new head
			if (tagName === 'link' && (child as HTMLLinkElement).rel === 'stylesheet') {
				continue;
			}
			if (tagName === 'script' && (child as HTMLScriptElement).src) {
				continue;
			}

			// Remove title, meta, etc. - they'll be replaced
			if (tagName === 'title' || tagName === 'meta') {
				toRemove.push(child);
			}
		}

		for (const el of toRemove) {
			el.remove();
		}

		// Add new head elements
		for (const child of newHead.children) {
			const tagName = child.tagName.toLowerCase();

			// Skip stylesheets that already exist
			if (tagName === 'link' && (child as HTMLLinkElement).rel === 'stylesheet') {
				if (currentStyles.has((child as HTMLLinkElement).href)) {
					continue;
				}
			}

			// Skip scripts that already exist
			if (tagName === 'script' && (child as HTMLScriptElement).src) {
				if (currentScripts.has((child as HTMLScriptElement).src)) {
					continue;
				}
			}

			// Clone and append
			currentHead.appendChild(child.cloneNode(true));
		}
	}

	/**
	 * Restore persisted elements to the new DOM
	 */
	private restorePersistedElements(persistedElements: Map<string, Element>): void {
		for (const [id, element] of persistedElements) {
			const placeholder = document.querySelector(`[${this.options.persistAttribute}="${id}"]`);

			if (placeholder) {
				placeholder.replaceWith(element);
			}
		}
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

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
	createRouter();
}
