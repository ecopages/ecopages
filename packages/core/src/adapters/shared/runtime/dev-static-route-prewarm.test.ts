import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runDevStaticRoutePrewarm } from './dev-static-route-prewarm.ts';

test('runDevStaticRoutePrewarm renders each pathname', async () => {
	const rendered: string[] = [];

	await runDevStaticRoutePrewarm({
		pathnames: ['/docs/a', '/docs/b'],
		renderPath: async (pathname) => {
			rendered.push(pathname);
		},
	});

	assert.deepEqual(rendered, ['/docs/a', '/docs/b']);
});

test('runDevStaticRoutePrewarm continues after a path failure', async () => {
	const rendered: string[] = [];

	await runDevStaticRoutePrewarm({
		pathnames: ['/ok', '/fail', '/also-ok'],
		renderPath: async (pathname) => {
			if (pathname === '/fail') {
				throw new Error('boom');
			}
			rendered.push(pathname);
		},
	});

	assert.deepEqual(rendered, ['/ok', '/also-ok']);
});

test('stopping prewarm skips queued paths and waits for active renders', async () => {
	const controller = new AbortController();
	const rendered: string[] = [];
	const finished: string[] = [];
	let releaseRenders!: () => void;
	const pendingRender = new Promise<void>((resolve) => {
		releaseRenders = resolve;
	});
	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});
	const prewarm = runDevStaticRoutePrewarm({
		pathnames: ['/a', '/b', '/c', '/d', '/e'],
		signal: controller.signal,
		renderPath: async (pathname) => {
			rendered.push(pathname);
			controller.abort();
			signalStarted();
			await pendingRender;
			finished.push(pathname);
		},
	});
	await started;
	const stillWaiting = await Promise.race([
		prewarm.then(
			() => 'settled' as const,
			() => 'settled' as const,
		),
		new Promise<'pending'>((resolve) => setImmediate(() => resolve('pending'))),
	]);
	assert.equal(stillWaiting, 'pending');
	releaseRenders();
	await prewarm;
	assert.deepEqual(rendered, ['/a']);
	assert.deepEqual(finished, rendered);
});
