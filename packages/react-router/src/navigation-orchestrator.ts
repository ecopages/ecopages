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
import {
	commitNavigationPage,
	ECO_PERSIST_ATTRIBUTE,
	fetchNavigationPage,
} from '@ecopages/core/router/navigation-pipeline';
import { type FetchedPageDocument, type LoadedPageModule, loadPageModuleFromDocument } from './navigation.ts';
import { isReactRouterPageBootstrapAssetSrc } from './hydration-assets.ts';

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
	viewTransitionsEnabled: boolean;
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

	let sharedPage: Awaited<ReturnType<typeof fetchNavigationPage>>;
	try {
		sharedPage = await fetchNavigationPage(input.url, { signal: input.signal });
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'AbortError')) {
			console.error('[EcoRouter] Navigation failed:', error);
		}
		return input.isStale() ? { kind: 'stale' } : { kind: 'hard-navigation', href: input.url, mode: 'location' };
	}
	if (input.isStale()) {
		return { kind: 'stale' };
	}

	if (!sharedPage) {
		return { kind: 'hard-navigation', href: input.url, mode: 'location' };
	}
	const finalPath = sharedPage.finalUrl.pathname + sharedPage.finalUrl.search + sharedPage.finalUrl.hash;
	const fetchedPage: FetchedPageDocument = {
		doc: sharedPage.document,
		finalPath,
		html: sharedPage.html,
	};

	const page = await loadPageModuleFromDocument(sharedPage.document, finalPath, {
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
 * Applies the shared navigation pipeline with React's page render as its swap.
 *
 * @remarks
 * React bootstrap scripts are excluded because the router already loaded and
 * adapted the page module before it reaches this commit.
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

	return await commitNavigationPage({
		url: navigationUrl,
		direction: outcome.direction,
		newDocument: page.doc,
		isStale: effects.isStale,
		viewTransitionsEnabled: !options.skipViewTransition && effects.viewTransitionsEnabled,
		persistAttribute: ECO_PERSIST_ATTRIBUTE,
		includeBodyScripts: false,
		skipScriptActivation: isReactRouterHydrationScript,
		onReloadRequested: () => effects.hardAssign(navigationUrl.href),
		beforeCommit: () => {
			effects.saveScrollPositions();
			effects.updateHistory(page.finalPath, requestedUrl, outcome.direction);
		},
		swap: async () => {
			const renderPromise = effects.waitForRender(nextPage);
			effects.runInReactTransition(() => {
				effects.commitPageData(page.moduleUrl, page.props);
				effects.setCurrentPage(nextPage);
			});
			await renderPromise;
			return !effects.isStale();
		},
		afterSwap: () => {
			effects.onCommittedPath(page.finalPath);
			effects.restoreScrollPositions(page.finalPath, options.isPopState);
		},
	});
}

function isReactRouterHydrationScript(script: HTMLScriptElement): boolean {
	const scriptId = script.getAttribute('data-eco-script-id');
	const src = script.getAttribute('src');
	return Boolean(
		(scriptId?.startsWith('ecopages-react-') && !scriptId.startsWith('ecopages-react-island-')) ||
		(src && isReactRouterPageBootstrapAssetSrc(src)),
	);
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
