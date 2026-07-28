import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runDevStaticRoutePrewarm } from './dev-static-route-prewarm.ts';

test('runDevStaticRoutePrewarm renders unique pathnames and registers them before rendering', async () => {
	const rendered: string[] = [];
	let registered: readonly string[] | undefined;

	await runDevStaticRoutePrewarm({
		pathnames: ['/docs/a', '/docs/b', '/docs/a'],
		renderPath: async (pathname) => {
			rendered.push(pathname);
		},
		onPathnamesResolved: (pathnames) => {
			registered = pathnames;
		},
	});

	assert.deepEqual(registered, ['/docs/a', '/docs/b']);
	assert.deepEqual(rendered, ['/docs/a', '/docs/b']);
});

test('runDevStaticRoutePrewarm continues after a path failure', async () => {
	const rendered: string[] = [];

	await runDevStaticRoutePrewarm({
		pathnames: ['/ok', '/fail', '/also-ok'],
		readiness: 'beforeReady',
		renderPath: async (pathname) => {
			if (pathname === '/fail') {
				throw new Error('boom');
			}
			rendered.push(pathname);
		},
	});

	assert.deepEqual(rendered, ['/ok', '/also-ok']);
});
