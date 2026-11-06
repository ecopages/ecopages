import { getEcoNavigationRuntime } from '@ecopages/core/client';
import type { EcoNavigationEvent } from '@ecopages/core/client';
import { commitNavigationPage } from '@ecopages/core/client';
import { manageWindowScroll } from '@ecopages/core/client';
import type { EcoNavigationOwner } from '@ecopages/core/client';
import { morphBody, recordInitialServerMarkup, type ServerMarkup } from './dom/body-morpher.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import type { EcoRouterOptions } from './types.ts';
import { resolveNavigationReloadDecision } from './navigation-commit-reload.ts';
import { syncDocumentElementAttributes } from './document-element-sync.ts';

export type NavigationCommitOptions = {
	html?: string;
	isStaleNavigation?: () => boolean;
	isSupersededNavigation?: () => boolean;
	allowFullDocumentFallback?: boolean;
	/** Set when the router reloads the current page; ignored when the response ends on another URL. */
	reload?: boolean;
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

function isSameDocumentUrl(left: URL, right: URL): boolean {
	return left.origin === right.origin && left.pathname === right.pathname && left.search === right.search;
}

/**
 * Commits a fetched document into the live page and dispatches navigation lifecycle events.
 */
export class NavigationCommit {
	private readonly prefetchManager: PrefetchManager | null;
	private readonly options: Required<EcoRouterOptions>;
	private serverMarkup: ServerMarkup | undefined;

	constructor(prefetchManager: PrefetchManager | null, options: Required<EcoRouterOptions>) {
		this.prefetchManager = prefetchManager;
		this.options = options;
	}

	/**
	 * Starts tracking the server markup of each body element, so a reload of the current URL keeps the elements
	 * whose markup did not change.
	 *
	 * @remarks
	 * Off until development HMR asks for it, so production navigations do no copying. The current body is the
	 * first baseline.
	 */
	trackServerMarkup(): void {
		if (this.serverMarkup) return;
		this.serverMarkup = new WeakMap();
		recordInitialServerMarkup(this.serverMarkup);
	}

	async commit(
		url: URL,
		direction: EcoNavigationEvent['direction'],
		newDocument: Document,
		options: NavigationCommitOptions = {},
	): Promise<boolean> {
		const allowFullDocumentFallback = options.allowFullDocumentFallback ?? true;
		const previousUrl = new URL(window.location.href);
		const reload = options.reload === true && isSameDocumentUrl(url, previousUrl);
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
			isSuperseded: options.isSupersededNavigation,
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
				if (reloadDecision.kind === 'reload') this.options.reloadDocument(reloadDecision.href);
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
				morphBody(newDocument, this.options.persistAttribute, { serverMarkup: this.serverMarkup, reload });
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
}
