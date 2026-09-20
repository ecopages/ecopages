import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import type { EcoNavigationEvent } from '@ecopages/core/router/navigation-lifecycle';
import type { NavigationCommit } from './navigation-commit.ts';
import type { DomSwapper } from './dom/dom-swapper.ts';
import type { PrefetchManager } from './services/prefetch-manager.ts';
import { fetchNavigationPage } from './navigation-fetch.ts';

export type PerformNavigationAttemptInput = {
	url: URL;
	direction: EcoNavigationEvent['direction'];
	bypassPrefetchCache?: boolean;
	allowFullDocumentFallback?: boolean;
	domSwapper: DomSwapper;
	navigationCommit: NavigationCommit;
	prefetchManager: PrefetchManager | null;
	isStaleNavigation: () => boolean;
	signal: AbortSignal;
};

export async function runPerformNavigationAttempt(input: PerformNavigationAttemptInput): Promise<boolean> {
	const html = await fetchNavigationPage(input.url, input.signal, {
		bypassCache: input.bypassPrefetchCache,
		getCachedHtml: input.prefetchManager ? (href) => input.prefetchManager!.getCachedHtml(href) : undefined,
	});
	if (input.isStaleNavigation()) {
		return false;
	}

	const newDocument = input.domSwapper.parseHTML(html, input.url);
	if (input.isStaleNavigation()) {
		return false;
	}

	return await input.navigationCommit.commit(input.url, input.direction, newDocument, {
		html,
		isStaleNavigation: input.isStaleNavigation,
		allowFullDocumentFallback: input.allowFullDocumentFallback ?? true,
	});
}

export function shouldIgnorePerformNavigationError(error: unknown, isStaleNavigation: () => boolean): boolean {
	if (isStaleNavigation()) {
		return true;
	}

	return error instanceof Error && error.name === 'AbortError';
}

export function replayQueuedBrowserRouterNavigation(
	queuedNavigationHref: string | null,
	performNavigation: (url: URL, direction: EcoNavigationEvent['direction']) => Promise<boolean>,
): void {
	if (!queuedNavigationHref || queuedNavigationHref === window.location.pathname + window.location.search) {
		return;
	}

	const navigationRuntime = getEcoNavigationRuntime(window);
	const ownerState = navigationRuntime.getOwnerState();

	if (ownerState.owner !== 'none' && ownerState.owner !== 'browser-router' && ownerState.canHandleSpaNavigation) {
		void navigationRuntime.requestNavigation({
			href: queuedNavigationHref,
			direction: 'forward',
			source: 'browser-router',
		});
		return;
	}

	void performNavigation(new URL(queuedNavigationHref, window.location.origin), 'forward');
}
