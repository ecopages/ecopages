import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { createAppBuildManifest } from './build-manifest.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { ViteHostBuildAdapter, setAppBuildAdapter, setAppBuildManifest } from './build-adapter.ts';
import { installBuildRuntime, requireBuildRuntime } from './build-runtime.ts';
import { DedupingBuildExecutor } from './deduping-build-executor.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';

function createTestAppConfig(): EcoPagesAppConfig {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as EcoPagesAppConfig;

	setAppBuildAdapter(appConfig, new RolldownBuildAdapter());
	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [],
		}),
	);

	return appConfig;
}

test('installBuildRuntime uses parallel executors for route-module and browser-hmr', () => {
	const appConfig = createTestAppConfig();

	const buildRuntime = installBuildRuntime(appConfig);

	assert.ok(buildRuntime.getProfile('route-module') instanceof DedupingBuildExecutor);
	assert.ok(buildRuntime.getProfile('browser-hmr') instanceof DedupingBuildExecutor);
	assert.ok(
		(buildRuntime.getProfile('route-module') as DedupingBuildExecutor).unwrap() instanceof ParallelBuildExecutor,
	);
	assert.ok(buildRuntime.getProfile('server-entry') instanceof SerializedBuildExecutor);
	assert.notEqual(
		buildRuntime.getProfile('route-module'),
		buildRuntime.getProfile('browser-hmr'),
		'route-module and browser-HMR own separate executors',
	);
});

test('requireBuildRuntime installs the runtime when missing', () => {
	const appConfig = createTestAppConfig();

	const buildRuntime = requireBuildRuntime(appConfig);

	assert.equal(appConfig.runtime?.buildRuntime, buildRuntime);
	assert.ok(buildRuntime.getProfile('route-module') instanceof DedupingBuildExecutor);
});

test('installBuildRuntime rejects Vite-host adapter builds at execution time', async () => {
	const appConfig = createTestAppConfig();
	setAppBuildAdapter(appConfig, new ViteHostBuildAdapter());

	const executor = installBuildRuntime(appConfig).getProfile('route-module');

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

test('requireBuildRuntime returns a stable server-entry executor', () => {
	const appConfig = createTestAppConfig();
	const buildRuntime = installBuildRuntime(appConfig);

	const first = buildRuntime.getProfile('server-entry');
	const second = requireBuildRuntime(appConfig).getProfile('server-entry');

	assert.ok(first instanceof SerializedBuildExecutor);
	assert.equal(first, second);
});
