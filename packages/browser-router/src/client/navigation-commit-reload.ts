import type { EcoNavigationOwner } from '@ecopages/core/router/navigation-coordinator';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';

export type NavigationReloadDecision = { kind: 'stale' } | { kind: 'reload'; href: string } | { kind: 'aborted' };

/**
 * Cleans up the outgoing document owner and decides whether to hard-reload.
 */
export async function resolveNavigationReloadDecision(input: {
	shouldCleanupCurrentOwner: boolean;
	currentDocumentOwner: EcoNavigationOwner;
	navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>;
	isStaleNavigation: () => boolean;
	allowFullDocumentFallback: boolean;
	urlHref: string;
}): Promise<NavigationReloadDecision> {
	if (input.shouldCleanupCurrentOwner) {
		await input.navigationRuntime.cleanupOwner(input.currentDocumentOwner);
	}

	if (input.isStaleNavigation()) {
		return { kind: 'stale' };
	}

	if (input.allowFullDocumentFallback) {
		return { kind: 'reload', href: input.urlHref };
	}

	return { kind: 'aborted' };
}
