import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import type { EcoNavigationEvent } from '@ecopages/core/router/navigation-lifecycle';
import { commitNavigationPage } from '@ecopages/core/router/navigation-pipeline';
import { manageWindowScroll } from '@ecopages/core/client/scroll';
import type { EcoNavigationOwner } from '@ecopages/core/router/navigation-coordinator';
import type { DomSwapper } from './dom/dom-swapper.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import type { EcoRouterOptions } from './types.ts';
import { resolveNavigationReloadDecision } from './navigation-commit-reload.ts';
import { syncDocumentElementAttributes } from './document-element-sync.ts';

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
	private readonly prefetchManager: PrefetchManager | null;
	private readonly options: Required<EcoRouterOptions>;

	constructor(domSwapper: DomSwapper, prefetchManager: PrefetchManager | null, options: Required<EcoRouterOptions>) {
		this.domSwapper = domSwapper;
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
		const result = await commitNavigationPage({
			url,
			direction,
			newDocument,
			isStale: isStaleNavigation,
			viewTransitionsEnabled: this.options.viewTransitions,
			persistAttribute: this.options.persistAttribute,
			onReloadRequested: async () => {
				const reloadDecision = await resolveNavigationReloadDecision({
					shouldCleanupCurrentOwner,
					currentDocumentOwner,
					navigationRuntime,
					isStaleNavigation,
					allowFullDocumentFallback,
					urlHref: url.href,
				});
				if (reloadDecision.kind === 'reload') this.reloadDocument(reloadDecision.href);
			},
			beforeTransition: async () => {
				if (shouldCleanupCurrentOwner) await navigationRuntime.cleanupOwner(currentDocumentOwner);
			},
			beforeCommit: () => {
				if (this.options.updateHistory && direction === 'forward') {
					window.history.pushState({}, '', url.href);
				} else if (direction === 'replace') {
					window.history.replaceState({}, '', url.href);
				}
			},
			swap: () => {
				syncDocumentElementAttributes(document, newDocument, this.options.documentElementAttributesToSync);
				this.domSwapper.morphBody(newDocument);
			},
			onSwapped: () => {
				navigationRuntime.adoptDocumentOwner(newDocument, 'browser-router');
			},
			afterSwap: () =>
				manageWindowScroll(url, previousUrl, {
					scrollBehavior: this.options.scrollBehavior,
					smoothScroll: this.options.smoothScroll,
				}),
			afterLifecycle: () => {
				this.prefetchManager?.observeLinks();
				if (options.html) this.prefetchManager?.cacheVisitedPage(url.href, options.html);
			},
		});

		return result === 'committed';
	}

	private reloadDocument(href: string): void {
		window.location.assign(href);
	}
}
