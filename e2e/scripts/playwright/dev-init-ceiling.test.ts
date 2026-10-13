import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackDevInit } from './dev-init-ceiling.mjs';

describe('trackDevInit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function track() {
		const onReady = vi.fn();
		const onExceeded = vi.fn();
		const tracker = trackDevInit({
			readyPattern: /server running at/,
			ceilingMs: 45_000,
			onReady,
			onExceeded,
			now: () => Date.now(),
		});
		return { tracker, onReady, onExceeded };
	}

	it('reports the init time when the ready line arrives within the ceiling', () => {
		const { tracker, onReady, onExceeded } = track();

		vi.advanceTimersByTime(29_500);
		tracker.onOutput('Node server running at http://localhost:4013');

		expect(onReady).toHaveBeenCalledExactlyOnceWith(29_500);
		expect(onExceeded).not.toHaveBeenCalled();
	});

	it('ignores output that is not the ready line', () => {
		const { tracker, onReady } = track();

		tracker.onOutput('warming up');

		expect(onReady).not.toHaveBeenCalled();
	});

	it('fails once the ceiling passes without a ready line', () => {
		const { onReady, onExceeded } = track();

		vi.advanceTimersByTime(45_000);

		expect(onExceeded).toHaveBeenCalledExactlyOnceWith(45_000);
		expect(onReady).not.toHaveBeenCalled();
	});

	it('does not fire again after the ready line, even when the ceiling later passes', () => {
		const { tracker, onReady, onExceeded } = track();

		tracker.onOutput('Bun server running at http://localhost:4013');
		vi.advanceTimersByTime(60_000);

		expect(onReady).toHaveBeenCalledOnce();
		expect(onExceeded).not.toHaveBeenCalled();
	});
});
