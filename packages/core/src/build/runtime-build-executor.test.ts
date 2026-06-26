import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from './build-manifest.ts';
import {
	getAppBuildAdapter,
	getAppBuildOwnership,
	setAppBuildAdapter,
	setAppBuildExecutor,
	setAppBuildManifest,
	ViteHostBuildAdapter,
	withBuildExecutorPlugins,
} from './build-adapter.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { installAppRuntimeBuildExecutor } from './runtime-build-executor.ts';

test('installAppRuntimeBuildExecutor wraps the active adapter in a SerializedBuildExecutor', () => {
	const staleExecutor = new RolldownBuildAdapter();
	const appConfig = {
		runtime: {
			buildExecutor: staleExecutor,
		},
		loaders: new Map(),
	} as never;

	setAppBuildAdapter(appConfig, new ViteHostBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	const executor = installAppRuntimeBuildExecutor(appConfig);

	assert.notEqual(executor, staleExecutor);
	assert.ok(executor instanceof SerializedBuildExecutor, 'wraps the executor in a FIFO-serialized layer');
});

test('installAppRuntimeBuildExecutor rejects when the app-owned adapter is a Vite-host boundary', async () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as never;

	setAppBuildAdapter(appConfig, new ViteHostBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	const executor = installAppRuntimeBuildExecutor(appConfig);

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

test('installAppRuntimeBuildExecutor merges app-owned server plugins into every build', async () => {
	const injectedPlugin = {
		name: 'test-injected-plugin',
		setup() {},
	};
	const observed: Array<unknown> = [];
	const baseAdapter = new RolldownBuildAdapter();
	const wrappedAdapter: import('./build-adapter.ts').BuildAdapter = {
		ownership: baseAdapter.ownership,
		resolve: baseAdapter.resolve.bind(baseAdapter),
		getTranspileOptions: baseAdapter.getTranspileOptions.bind(baseAdapter),
		async build(options) {
			observed.push(options.plugins);
			return { success: true, logs: [], outputs: [] };
		},
	};
	const appConfig = {
		runtime: { buildAdapter: wrappedAdapter },
		loaders: new Map(),
	} as never;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [injectedPlugin],
		}),
	);

	const executor = installAppRuntimeBuildExecutor(appConfig);
	await executor.build({
		entrypoints: ['/tmp/entry.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'browser',
		format: 'esm',
		sourcemap: 'none',
	});

	assert.equal(observed.length, 1, 'inner adapter received one build call');
	const observedPlugins = observed[0] as Array<{ name: string }> | undefined;
	assert.ok(observedPlugins?.some((plugin) => plugin.name === injectedPlugin.name));
});

test('installAppRuntimeBuildExecutor does not double-wrap an already-wrapped executor', () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as never;

	setAppBuildAdapter(appConfig, new RolldownBuildAdapter());
	setAppBuildExecutor(
		appConfig,
		withBuildExecutorPlugins(new RolldownBuildAdapter(), () => []),
	);

	const installed = installAppRuntimeBuildExecutor(appConfig);
	assert.ok(installed instanceof SerializedBuildExecutor);
	assert.equal(getAppBuildAdapter(appConfig).ownership, 'rolldown');
	assert.equal(getAppBuildOwnership(appConfig), 'rolldown');
});
