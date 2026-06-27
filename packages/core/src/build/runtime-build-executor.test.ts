import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from './build-manifest.ts';
import {
	setAppBuildAdapter,
	setAppBuildManifest,
	ViteHostBuildAdapter,
} from './build-adapter.ts';
import { getBuildRuntime, requireBuildRuntime } from './build-runtime.ts';
import { DedupingBuildExecutor } from './deduping-build-executor.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';
import { getInstalledServerEntryBuildExecutor, installAppRuntimeBuildExecutor } from './runtime-build-executor.ts';

test('installAppRuntimeBuildExecutor wraps the active adapter in a ParallelBuildExecutor', () => {
	const staleExecutor = new RolldownBuildAdapter();
	const appConfig = {
		runtime: {
			buildRuntime: {
				getProfile: () => staleExecutor,
				dispose: async () => undefined,
			},
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
	assert.ok(executor instanceof DedupingBuildExecutor, 'wraps the executor in a deduping route-module layer');
	assert.ok(executor.unwrap() instanceof ParallelBuildExecutor, 'deduping layer wraps a parallel executor');
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

test('installAppRuntimeBuildExecutor installs separate executors for route modules and HMR', () => {
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

	const buildRuntime = getBuildRuntime(appConfig);
	assert.ok(buildRuntime);

	const routeExecutor = buildRuntime.getProfile('route-module');
	const hmrExecutor = buildRuntime.getProfile('browser-hmr');

	assert.ok(routeExecutor instanceof DedupingBuildExecutor);
	assert.ok(hmrExecutor instanceof DedupingBuildExecutor);
	assert.ok(routeExecutor.unwrap() instanceof ParallelBuildExecutor);
	assert.ok(hmrExecutor.unwrap() instanceof ParallelBuildExecutor);
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
	assert.equal(requireBuildRuntime(appConfig).getProfile('server-entry'), first);
});
