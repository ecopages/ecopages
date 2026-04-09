import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from './build-manifest.ts';
import { setAppBuildAdapter, setAppBuildManifest, ViteHostBuildAdapter } from './build-adapter.ts';
import { createAppBuildExecutor, DevBuildCoordinator } from './dev-build-coordinator.ts';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';
import { installAppRuntimeBuildExecutor } from './runtime-build-executor.ts';

test('installAppRuntimeBuildExecutor replaces Bun-only coordinator state on the Vite-host path', async () => {
	const staleBunCoordinator = new DevBuildCoordinator(new EsbuildBuildAdapter());
	const appConfig = {
		runtime: {
			buildExecutor: staleBunCoordinator,
		},
		loaders: new Map(),
	} as any;

	setAppBuildAdapter(appConfig, new ViteHostBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	const executor = installAppRuntimeBuildExecutor(appConfig, {
		development: true,
	});

	assert.notEqual(executor, staleBunCoordinator);
	assert.ok(!(executor instanceof DevBuildCoordinator));

	await assert.rejects(
		executor.build({
			entrypoints: ['/tmp/entry.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
		/Vite-hosted builds are owned by the host runtime/,
	);
});

test('installAppRuntimeBuildExecutor keeps Bun-native development execution off the raw adapter path', () => {
	const adapter = new EsbuildBuildAdapter();
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as any;

	setAppBuildAdapter(appConfig, adapter);
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	const executor = installAppRuntimeBuildExecutor(appConfig, {
		development: true,
	});

	assert.notEqual(executor, adapter);
	assert.notEqual(appConfig.runtime.buildExecutor, adapter);
	assert.equal(appConfig.runtime.buildExecutor, executor);
});

test('createAppBuildExecutor keeps Bun-native production execution on the plain Bun adapter boundary', () => {
	const adapter = new EsbuildBuildAdapter();
	const executor = createAppBuildExecutor({
		development: false,
	});

	assert.notEqual(executor, adapter);
	assert.ok(!(executor instanceof DevBuildCoordinator));
	assert.equal('ownership' in executor ? executor.ownership : undefined, 'bun-native');
});
