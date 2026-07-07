import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { manageWindowScroll } from '@ecopages/core/client/scroll';
import type { DomSwapper } from './services/dom-swapper.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import type { ViewTransitionManager } from './services/view-transition-manager.ts';
import type { EcoAfterSwapEvent, EcoBeforeSwapEvent, EcoNavigationEvent, EcoRouterOptions } from './types.ts';

export type CommitDocumentNavigationDeps = {
	domSwapper: DomSwapper;
	viewTransitionManager: ViewTransitionManager;
	prefetchManager: PrefetchManager | null;
	options: Required<EcoRouterOptions>;
	syncDocumentElementAttributes: (newDocument: Document) => void;
	reloadDocument: (url: URL) => void;
};

export type CommitDocumentNavigationOptions = {
	html?: string;
	isStaleNavigation?: () => boolean;
	allowFullDocumentFallback?: boolean;
};

/**
 * Commits a fetched document into the live page and dispatches navigation lifecycle events.
 */
export async function commitDocumentNavigation(
	deps: CommitDocumentNavigationDeps,
	url: URL,
	direction: EcoNavigationEvent['direction'],
	newDocument: Document,
	options: CommitDocumentNavigationOptions = {},
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
	if (isStaleNavigation()) {
		return false;
	}

	if (shouldReload) {
		if (shouldCleanupCurrentOwner) {
			await navigationRuntime.cleanupOwner(currentDocumentOwner);
		}
		if (isStaleNavigation()) {
			return false;
		}
		if (allowFullDocumentFallback) {
			deps.reloadDocument(url);
		}
		return false;
	}

	const useViewTransitions = deps.options.viewTransitions;
	await deps.domSwapper.preloadStylesheets(newDocument);
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

		if (deps.options.updateHistory && direction === 'forward') {
			window.history.pushState({}, '', url.href);
		} else if (direction === 'replace') {
			window.history.replaceState({}, '', url.href);
		}

		deps.syncDocumentElementAttributes(newDocument);
		const { bodyStrategy } = deps.domSwapper.morphHead(newDocument);
		if (useViewTransitions && bodyStrategy === 'morph') {
			deps.domSwapper.morphBody(newDocument);
		} else {
			deps.domSwapper.replaceBody(newDocument);
		}
		deps.domSwapper.flushRerunScripts();
		manageWindowScroll(url, previousUrl, {
			scrollBehavior: deps.options.scrollBehavior,
			smoothScroll: deps.options.smoothScroll,
		});
	};

	if (useViewTransitions) {
		await deps.viewTransitionManager.transition(commitSwap);
	} else {
		commitSwap();
	}

	if (isStaleNavigation()) {
		return false;
	}

	navigationRuntime.adoptDocumentOwner(newDocument, 'browser-router');

	const afterSwapEvent: EcoAfterSwapEvent = {
		url,
		direction,
	};

	document.dispatchEvent(new CustomEvent('eco:after-swap', { detail: afterSwapEvent }));

	deps.prefetchManager?.observeNewLinks();

	if (options.html) {
		deps.prefetchManager?.cacheVisitedPage(url.href, options.html);
	}

	requestAnimationFrame(() => {
		if (isStaleNavigation()) return;

		document.dispatchEvent(
			new CustomEvent('eco:page-load', {
				detail: { url, direction } as EcoNavigationEvent,
			}),
		);
	});

	return true;
}
