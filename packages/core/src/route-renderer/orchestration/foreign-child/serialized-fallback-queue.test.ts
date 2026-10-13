import { describe, expect, it, vi } from 'vitest';
import { createSerializedFallbackQueue, runWithSerializedFallback } from './serialized-fallback-queue.ts';

describe('runWithSerializedFallback', () => {
	it('runs one render at a time', async () => {
		let active = 0;
		let maximumActive = 0;
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const queue = createSerializedFallbackQueue();
		const enter = async (gate?: Promise<void>) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await gate;
			active -= 1;
		};

		const first = runWithSerializedFallback(queue, () => enter(firstGate));
		await vi.waitUntil(() => active === 1);
		const second = runWithSerializedFallback(queue, () => enter());

		await Promise.resolve();
		await Promise.resolve();
		expect(active).toBe(1);
		expect(maximumActive).toBe(1);
		releaseFirst?.();
		await Promise.all([first, second]);
		expect(maximumActive).toBe(1);
	});
});
