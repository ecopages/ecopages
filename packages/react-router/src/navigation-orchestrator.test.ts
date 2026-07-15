import { describe, expect, it } from 'vitest';
import { decideQueuedNavigationReplay } from '../src/navigation-orchestrator.ts';

describe('decideQueuedNavigationReplay', () => {
	it('skips when there is no queued href', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: null,
				committedPath: '/a',
				runtimeActive: true,
			}),
		).toEqual({ kind: 'none' });
	});

	it('skips when the queued path already matches the committed path', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: '/a?x=1',
				committedPath: '/a?x=1',
				runtimeActive: true,
			}),
		).toEqual({ kind: 'none' });
	});

	it('replays locally while React still owns the runtime', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: '/b',
				committedPath: '/a',
				runtimeActive: true,
			}),
		).toEqual({ kind: 'local-navigate', href: '/b' });
	});

	it('replays through the coordinator after cleanup-before-handoff', () => {
		expect(
			decideQueuedNavigationReplay({
				queuedHref: '/b',
				committedPath: '/a',
				runtimeActive: false,
			}),
		).toEqual({ kind: 'coordinator-navigate', href: '/b' });
	});
});
