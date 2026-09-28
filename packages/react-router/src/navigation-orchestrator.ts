/**
 * Explicit React-router navigation outcomes and commit ordering.
 *
 * @remarks
 * Resolution (fetch → module load → spa | handoff | hard) is pure relative to
 * DOM/React side effects. The EcoRouter bridge supplies those effects and keeps
 * `isNavigating` consistent from the returned outcome terminals.
 *
 * @module
 */

import { isStaticAssetHref } from '@ecopages/core/router/link-intent';
import type { EcoNavigationDirection } from '@ecopages/core/router/navigation-coordinator';
import { completeNavigationLifecycle, dispatchBeforeSwap } from '@ecopages/core/router/navigation-lifecycle';
import { navigationHasNamedViewTransitions } from '@ecopages/core/client/view-transitions';
import {
	type FetchedPageDocument,
	type LoadedPageModule,
	fetchPageDocument,
	loadPageModuleFromDocument,
} from './navigation.ts';

export type NavigationDirection = EcoNavigationDirection;

/**
 * Terminal decision for one navigate() attempt before React/DOM commit.
 */
export type ReactNavigationOutcome =
	| { kind: 'stale' }
	| { kind: 'hard-navigation'; href: string; mode: 'assign' | 'location' }
	| {
			kind: 'spa';
			page: LoadedPageModule;
			direction: NavigationDirection;
			refreshPersistedLayout: boolean;
			requestedUrl: string;
	  }
	| {
			kind: 'handoff';
			href: string;
			fetched: FetchedPageDocument;
			direction: NavigationDirection;
	  };

export type ResolveReactNavigationInput = {
	url: string;
	signal: AbortSignal;
	isStale: () => boolean;
	isPopState: boolean;
	pushHistory: boolean;
	moduleUrlOverride?: string;
};

export type SpaCommitEffects = {
	isStale: () => boolean;
	hardAssign: (href: string) => void;
	morphHead: (doc: Document) => Promise<{ cleanup: () => void; flushRerunScripts: () => void }>;
	applyViewTransitionNames: () => void;
	saveScrollPositions: () => void;
	restoreScrollPositions: (finalPath: string, isPopState: boolean) => void;
	updateHistory: (finalPath: string, requestedUrl: string, direction: NavigationDirection) => void;
	commitPageData: (moduleUrl: string, props: Record<string, unknown>) => void;
	setCurrentPage: (page: {
		Component: LoadedPageModule['Component'];
		props: Record<string, unknown>;
		refreshPersistedLayout: boolean;
	}) => void;
	waitForRender: (page: {
		Component: LoadedPageModule['Component'];
		props: Record<string, unknown>;
		refreshPersistedLayout: boolean;
	}) => Promise<void>;
	runInReactTransition: (update: () => void) => void;
	startViewTransition?: (update: () => Promise<void>) => Promise<void>;
	onCommittedPath: (finalPath: string) => void;
};

export type SpaCommitResult = 'committed' | 'stale' | 'reload-requested';

export type HandoffEffects = {
	isStale: () => boolean;
	requestHandoff: (request: {
		href: string;
		finalHref: string;
		direction: NavigationDirection;
		document: Document;
		html: string;
		isStaleSourceNavigation: () => boolean;
	}) => Promise<boolean>;
	hardAssign: (href: string) => void;
};

export type HandoffResult = 'handed-off' | 'hard-fallback' | 'stale';

export type QueueReplayDecision =
	{ kind: 'none' } | { kind: 'local-navigate'; href: string } | { kind: 'coordinator-navigate'; href: string };

function resolveDirection(isPopState: boolean, pushHistory: boolean): NavigationDirection {
	if (isPopState) {
		return 'back';
	}
	return pushHistory ? 'forward' : 'replace';
}

/**
 * Resolves fetch + module discovery into an explicit navigation outcome.
 */
export async function resolveReactNavigation(input: ResolveReactNavigationInput): Promise<ReactNavigationOutcome> {
	if (isStaticAssetHref(input.url)) {
		return {
			kind: 'hard-navigation',
			href: new URL(input.url, window.location.origin).href,
			mode: 'assign',
		};
	}

	const fetchedPage = await fetchPageDocument(input.url, { signal: input.signal });
	if (input.isStale()) {
		return { kind: 'stale' };
	}

	if (!fetchedPage) {
		return { kind: 'hard-navigation', href: input.url, mode: 'location' };
	}

	const page = await loadPageModuleFromDocument(fetchedPage.doc, fetchedPage.finalPath, {
		moduleUrlOverride: input.moduleUrlOverride,
	});
	if (input.isStale()) {
		return { kind: 'stale' };
	}

	const direction = resolveDirection(input.isPopState, input.pushHistory);

	if (page) {
		return {
			kind: 'spa',
			page,
			direction,
			refreshPersistedLayout: Boolean(input.moduleUrlOverride),
			requestedUrl: input.url,
		};
	}

	return {
		kind: 'handoff',
		href: input.url,
		fetched: fetchedPage,
		direction,
	};
}

/**
 * Applies SPA commit ordering: head morph → history → React commit → finalize.
 *
 * @remarks
 * View transitions wrap the React commit when `startViewTransition` is provided.
 * Stale checks after async boundaries abort without leaving head morph half-applied.
 */
export async function applySpaNavigation(
	outcome: Extract<ReactNavigationOutcome, { kind: 'spa' }>,
	effects: SpaCommitEffects,
	options: { skipViewTransition: boolean; isPopState: boolean },
): Promise<SpaCommitResult> {
	const { page, requestedUrl, refreshPersistedLayout } = outcome;
	const navigationUrl = new URL(page.finalPath, window.location.origin);
	const nextPage = {
		Component: page.Component,
		props: page.props,
		refreshPersistedLayout,
	};

	const { requestedReload } = dispatchBeforeSwap(document, {
		url: navigationUrl,
		direction: outcome.direction,
		newDocument: page.doc,
	});
	if (effects.isStale()) {
		return 'stale';
	}
	if (requestedReload) {
		effects.hardAssign(navigationUrl.href);
		return 'reload-requested';
	}

	const { cleanup: cleanupHead, flushRerunScripts } = await effects.morphHead(page.doc);

	const finalizeCommittedNavigation = () => {
		effects.onCommittedPath(page.finalPath);
		flushRerunScripts();
		cleanupHead();
		effects.applyViewTransitionNames();
		effects.restoreScrollPositions(page.finalPath, options.isPopState);
		completeNavigationLifecycle(
			document,
			{ url: navigationUrl, direction: outcome.direction },
			{ isStale: effects.isStale },
		);
	};

	const commitNextPage = () => {
		effects.commitPageData(page.moduleUrl, page.props);
		effects.setCurrentPage(nextPage);
	};

	if (effects.isStale()) {
		cleanupHead();
		return 'stale';
	}

	effects.applyViewTransitionNames();
	effects.saveScrollPositions();
	effects.updateHistory(page.finalPath, requestedUrl, outcome.direction);

	if (
		!options.skipViewTransition &&
		effects.startViewTransition &&
		navigationHasNamedViewTransitions(document, page.doc)
	) {
		await effects.startViewTransition(async () => {
			if (effects.isStale()) {
				cleanupHead();
				return;
			}
			const renderPromise = effects.waitForRender(nextPage);
			effects.runInReactTransition(() => {
				commitNextPage();
			});
			await renderPromise;
			if (effects.isStale()) {
				cleanupHead();
				return;
			}
			finalizeCommittedNavigation();
		});
		return effects.isStale() ? 'stale' : 'committed';
	}

	const renderPromise = effects.waitForRender(nextPage);
	commitNextPage();
	await renderPromise;
	if (effects.isStale()) {
		cleanupHead();
		return 'stale';
	}
	finalizeCommittedNavigation();
	return 'committed';
}

/**
 * Hands a non-React document to the shared coordinator, or hard-navigates.
 */
export async function applyHandoffNavigation(
	outcome: Extract<ReactNavigationOutcome, { kind: 'handoff' }>,
	effects: HandoffEffects,
): Promise<HandoffResult> {
	if (effects.isStale()) {
		return 'stale';
	}

	const handled = await effects.requestHandoff({
		href: outcome.href,
		finalHref: outcome.fetched.finalPath,
		direction: outcome.direction,
		document: outcome.fetched.doc,
		html: outcome.fetched.html,
		isStaleSourceNavigation: effects.isStale,
	});

	if (!handled) {
		effects.hardAssign(outcome.fetched.finalPath);
		return 'hard-fallback';
	}

	return 'handed-off';
}

/**
 * Decides whether a queued click should replay after the active navigation ends.
 *
 * @remarks
 * When React still owns the runtime, replay through local `navigate`. After a
 * cleanup-before-handoff, replay through the shared coordinator so the newest
 * owner receives the intent.
 */
export function decideQueuedNavigationReplay(input: {
	queuedHref: string | null;
	committedPath: string;
	runtimeActive: boolean;
}): QueueReplayDecision {
	if (!input.queuedHref) {
		return { kind: 'none' };
	}

	const queuedUrl = new URL(input.queuedHref, 'http://ecopages.local');
	const queuedPath = queuedUrl.pathname + queuedUrl.search;

	if (queuedPath === input.committedPath) {
		return { kind: 'none' };
	}

	return input.runtimeActive
		? { kind: 'local-navigate', href: input.queuedHref }
		: { kind: 'coordinator-navigate', href: input.queuedHref };
}
