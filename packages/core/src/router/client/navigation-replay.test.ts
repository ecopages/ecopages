import { describe, expect, it } from 'vitest';
import { decideQueuedNavigationReplay } from './navigation-replay.ts';

const committedHref = 'https://example.test/a?x=1#old';

describe('decideQueuedNavigationReplay', () => {
	it('skips when there is no queued href', () => {
		expect(decideQueuedNavigationReplay({ queuedHref: null, committedHref, routeToCoordinator: false })).toEqual({
			kind: 'none',
		});
	});

	it('skips when the queued page and fragment already match the committed URL', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: '/a?x=1#old',
				committedHref,
				routeToCoordinator: false,
			}),
		).toEqual({ kind: 'none' });
	});

	it('replays a queued fragment change after its page commits', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: '/a?x=1#next',
				committedHref: '/a?x=1#old',
				routeToCoordinator: false,
			}),
		).toEqual({ kind: 'local-navigate', href: '/a?x=1#next' });
	});

	it('routes a queued navigation to the local router when it owns the runtime', () => {
		expect(decideQueuedNavigationReplay({ queuedHref: '../b', committedHref, routeToCoordinator: false })).toEqual({
			kind: 'local-navigate',
			href: '../b',
		});
	});

	it('routes a queued navigation through the coordinator after owner cleanup', () => {
		expect(decideQueuedNavigationReplay({ queuedHref: '/b', committedHref, routeToCoordinator: true })).toEqual({
			kind: 'coordinator-navigate',
			href: '/b',
		});
	});
});
