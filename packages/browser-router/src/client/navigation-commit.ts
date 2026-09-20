import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import {
	completeNavigationLifecycle,
	dispatchBeforeSwap,
	type EcoNavigationEvent,
} from '@ecopages/core/router/navigation-lifecycle';
import type { EcoNavigationOwner } from '@ecopages/core/router/navigation-coordinator';
import type { DomSwapper } from './dom/dom-swapper.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import type { ViewTransitionManager } from './services/view-transition-manager.ts';
import type { EcoRouterOptions } from './types.ts';
import { resolveNavigationReloadDecision } from './navigation-commit-reload.ts';
import { runBrowserRouterCommitSwap } from './navigation-commit-swap.ts';

export type NavigationCommitOptions = {
	html?: string;
	isStaleNavigation?: () => boolean;
	allowFullDocumentFallback?: boolean;
};

type CommitOwnerContext = {
	currentDocumentOwner: EcoNavigationOwner;
	shouldCleanupCurrentOwner: boolean;
};

function resolveCommitOwnerContext(
	navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>,
	newDocument: Document,
): CommitOwnerContext {
	const currentDocumentOwner = navigationRuntime.resolveDocumentOwner(document, 'browser-router');
	const newDocumentOwner = navigationRuntime.resolveDocumentOwner(newDocument, 'browser-router');
	const activeOwner = navigationRuntime.getOwnerState().owner;
	const shouldCleanupCurrentOwner =
		currentDocumentOwner !== newDocumentOwner &&
		currentDocumentOwner !== 'browser-router' &&
		activeOwner === currentDocumentOwner;

	return { currentDocumentOwner, shouldCleanupCurrentOwner };
}

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
		const { currentDocumentOwner, shouldCleanupCurrentOwner } = resolveCommitOwnerContext(
			navigationRuntime,
			newDocument,
		);
		const { requestedReload } = dispatchBeforeSwap(document, {
			url,
			direction,
			newDocument,
		});
		if (isStaleNavigation()) {
			return false;
		}

		if (requestedReload) {
			const reloadDecision = await resolveNavigationReloadDecision({
				shouldCleanupCurrentOwner,
				currentDocumentOwner,
				navigationRuntime,
				isStaleNavigation,
				allowFullDocumentFallback,
				urlHref: url.href,
			});
			if (reloadDecision.kind === 'reload') {
				this.reloadDocument(reloadDecision.href);
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
			runBrowserRouterCommitSwap({
				url,
				previousUrl,
				direction,
				newDocument,
				isStaleNavigation,
				domSwapper: this.domSwapper,
				options: this.options,
				useViewTransitions,
			});
		};

		if (useViewTransitions) {
			await this.viewTransitionManager.transition(commitSwap, { incomingDocument: newDocument });
		} else {
			commitSwap();
		}

		if (isStaleNavigation()) {
			return false;
		}

		navigationRuntime.adoptDocumentOwner(newDocument, 'browser-router');

		completeNavigationLifecycle(document, { url, direction }, { isStale: isStaleNavigation });

		this.prefetchManager?.observeLinks();

		if (options.html) {
			this.prefetchManager?.cacheVisitedPage(url.href, options.html);
		}

		return true;
	}

	private reloadDocument(href: string): void {
		window.location.assign(href);
	}
}
