import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from './build-manifest.ts';
import {
	getAppBuildExecutor,
	getAppHmrBuildExecutor,
	setAppBuildAdapter,
	setAppBuildExecutor,
	setAppBuildManifest,
	ViteHostBuildAdapter,
	withBuildExecutorPlugins,
} from './build-adapter.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { getInstalledServerEntryBuildExecutor, installAppRuntimeBuildExecutor } from './runtime-build-executor.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';

test('installAppRuntimeBuildExecutor wraps the active adapter in a ParallelBuildExecutor', () => {
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
	assert.ok(executor instanceof ParallelBuildExecutor, 'wraps the executor in a parallel route-module layer');
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
	assert.ok(installed instanceof ParallelBuildExecutor);
});

test('installAppRuntimeBuildExecutor installs separate parallel executors for route modules and HMR', () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as never;

	setAppBuildAdapter(appConfig, new RolldownBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	installAppRuntimeBuildExecutor(appConfig);

	const routeExecutor = getAppBuildExecutor(appConfig);
	const hmrExecutor = getAppHmrBuildExecutor(appConfig);

	assert.ok(routeExecutor instanceof ParallelBuildExecutor);
	assert.ok(hmrExecutor instanceof ParallelBuildExecutor);
	assert.notEqual(routeExecutor, hmrExecutor);
});

test('getInstalledServerEntryBuildExecutor returns one SerializedBuildExecutor per app config', () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as never;

	setAppBuildAdapter(appConfig, new RolldownBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	const first = getInstalledServerEntryBuildExecutor(appConfig);
	const second = getInstalledServerEntryBuildExecutor(appConfig);

	assert.ok(first instanceof SerializedBuildExecutor);
	assert.equal(first, second);
	assert.equal(appConfig.runtime?.serverEntryBuildExecutor, first);
});
