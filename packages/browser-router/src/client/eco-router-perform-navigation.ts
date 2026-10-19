import { fetchNavigationPage } from '@ecopages/core/client';
import type { EcoNavigationEvent } from '@ecopages/core/client';
import type { NavigationCommit } from './navigation-commit.ts';

export type PerformNavigationAttemptInput = {
	url: URL;
	direction: EcoNavigationEvent['direction'];
	bypassPrefetchCache?: boolean;
	allowFullDocumentFallback?: boolean;
	navigationCommit: NavigationCommit;
	isStaleNavigation: () => boolean;
	signal: AbortSignal;
};

/**
 * Fetches the target page and commits it.
 *
 * @remarks
 * The shared navigation cache outlives the router, so a router without a prefetch manager must set
 * `bypassPrefetchCache`. Otherwise the first fetched copy of a page is served for the rest of the session.
 */
export async function runPerformNavigationAttempt(input: PerformNavigationAttemptInput): Promise<boolean> {
	const page = await fetchNavigationPage(input.url, {
		signal: input.signal,
		bypassCache: input.bypassPrefetchCache,
	});
	if (!page) {
		throw new Error('Navigation response was not a successful HTML page');
	}
	if (input.isStaleNavigation()) {
		return false;
	}

	return await input.navigationCommit.commit(page.finalUrl, input.direction, page.document, {
		html: page.html,
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
