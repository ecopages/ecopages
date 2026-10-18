import { isSamePageHref } from './link-navigation-policy.ts';

export type QueueReplayDecision =
	{ kind: 'none' } | { kind: 'local-navigate'; href: string } | { kind: 'coordinator-navigate'; href: string };

export type DecideQueuedNavigationReplayInput = {
	queuedHref: string | null;
	committedHref: string;
	routeToCoordinator: boolean;
};

/** Applies the shared same-page rule before a router replays its queued click. */
export function decideQueuedNavigationReplay(input: DecideQueuedNavigationReplayInput): QueueReplayDecision {
	if (!input.queuedHref) {
		return { kind: 'none' };
	}
	if (isSamePageHref(input.queuedHref, input.committedHref)) {
		const baseHref = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
		const committedUrl = new URL(input.committedHref, baseHref);
		const queuedUrl = new URL(input.queuedHref, committedUrl);
		if (queuedUrl.hash === committedUrl.hash) return { kind: 'none' };
	}

	return input.routeToCoordinator
		? { kind: 'coordinator-navigate', href: input.queuedHref }
		: { kind: 'local-navigate', href: input.queuedHref };
}
