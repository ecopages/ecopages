import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { createAppBuildManifest } from './build-manifest.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { installBuildRuntime, requireBuildRuntime } from './build-runtime.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';
import { setAppBuildAdapter, setAppBuildManifest } from './build-adapter.ts';

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

	assert.ok(buildRuntime.getProfile('route-module') instanceof ParallelBuildExecutor);
	assert.ok(buildRuntime.getProfile('browser-hmr') instanceof ParallelBuildExecutor);
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
	assert.ok(buildRuntime.getProfile('route-module') instanceof ParallelBuildExecutor);
});
