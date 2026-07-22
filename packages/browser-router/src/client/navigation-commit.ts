import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import {
	dispatchAfterSwap,
	dispatchBeforeSwap,
	schedulePageLoad,
	type EcoNavigationEvent,
} from '@ecopages/core/router/navigation-lifecycle';
import { manageWindowScroll } from '@ecopages/core/client/scroll';
import { syncDocumentElementAttributes } from './document-element-sync.ts';
import type { DomSwapper } from './dom/dom-swapper.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import type { ViewTransitionManager } from './services/view-transition-manager.ts';
import type { EcoRouterOptions } from './types.ts';

export type NavigationCommitOptions = {
	html?: string;
	isStaleNavigation?: () => boolean;
	allowFullDocumentFallback?: boolean;
};

/**
 * Commits a fetched document into the live page and dispatches navigation lifecycle events.
 */
export class NavigationCommit {
	private readonly domSwapper: DomSwapper;
	private readonly viewTransitionManager: ViewTransitionManager;
	private readonly prefetchManager: PrefetchManager | null;
	private readonly options: Required<EcoRouterOptions>;

	constructor(
		domSwapper: DomSwapper,
		viewTransitionManager: ViewTransitionManager,
		prefetchManager: PrefetchManager | null,
		options: Required<EcoRouterOptions>,
	) {
		this.domSwapper = domSwapper;
		this.viewTransitionManager = viewTransitionManager;
		this.prefetchManager = prefetchManager;
		this.options = options;
	}

	async commit(
		url: URL,
		direction: EcoNavigationEvent['direction'],
		newDocument: Document,
		options: NavigationCommitOptions = {},
	): Promise<boolean> {
		const allowFullDocumentFallback = options.allowFullDocumentFallback ?? true;
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
		const { requestedReload } = dispatchBeforeSwap(document, {
			url,
			direction,
			newDocument,
		});
		if (isStaleNavigation()) {
			return false;
		}

		if (requestedReload) {
			if (shouldCleanupCurrentOwner) {
				await navigationRuntime.cleanupOwner(currentDocumentOwner);
			}
			if (isStaleNavigation()) {
				return false;
			}
			if (allowFullDocumentFallback) {
				this.reloadDocument(url.href);
			}
			return false;
		}

		const useViewTransitions = this.options.viewTransitions;
		await this.domSwapper.preloadStylesheets(newDocument);
		if (isStaleNavigation()) {
			return false;
		}

		if (shouldCleanupCurrentOwner) {
			await navigationRuntime.cleanupOwner(currentDocumentOwner);
		}

		if (isStaleNavigation()) {
			return false;
		}

		const commitSwap = () => {
			if (isStaleNavigation()) return;

			if (this.options.updateHistory && direction === 'forward') {
				window.history.pushState({}, '', url.href);
			} else if (direction === 'replace') {
				window.history.replaceState({}, '', url.href);
			}

			syncDocumentElementAttributes(document, newDocument, this.options.documentElementAttributesToSync);
			const { bodyStrategy } = this.domSwapper.morphHead(newDocument);
			if (useViewTransitions && bodyStrategy === 'morph') {
				this.domSwapper.morphBody(newDocument);
			} else {
				this.domSwapper.replaceBody(newDocument);
			}
			this.domSwapper.flushRerunScripts();
			manageWindowScroll(url, previousUrl, {
				scrollBehavior: this.options.scrollBehavior,
				smoothScroll: this.options.smoothScroll,
			});
		};

		if (useViewTransitions) {
			await this.viewTransitionManager.transition(commitSwap);
		} else {
			commitSwap();
		}

		if (isStaleNavigation()) {
			return false;
		}

		navigationRuntime.adoptDocumentOwner(newDocument, 'browser-router');

		dispatchAfterSwap(document, { url, direction });

		this.prefetchManager?.observeLinks();

		if (options.html) {
			this.prefetchManager?.cacheVisitedPage(url.href, options.html);
		}

		schedulePageLoad(document, { url, direction }, { isStale: isStaleNavigation });

		return true;
	}

	private reloadDocument(href: string): void {
		window.location.assign(href);
	}
}
