import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from '../contracts/build-manifest.ts';
import {
	createBrowserBuildRequest,
	createServerBuildRequest,
	mergeCallerBuildPlugins,
	resolveServerAppBuildPlugins,
} from './build-request-policy.ts';
import { setAppBuildManifest } from '../build-adapter.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { EcoSourceTransform } from '../../plugins/source-transform.ts';

function createAppConfig(): EcoPagesAppConfig {
	const appConfig = {
		rootDir: '/app',
		loaders: new Map(),
		runtime: {},
		absolutePaths: {
			projectDir: '/app',
		},
		integrations: [],
	} as unknown as EcoPagesAppConfig;

	const appPlugin: EcoBuildPlugin = { name: 'app-plugin', setup() {} };
	const browserPlugin: EcoBuildPlugin = { name: 'browser-plugin', environments: ['browser'], setup() {} };

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			plugins: [appPlugin, browserPlugin],
		}),
	);

	return appConfig;
}

test('mergeCallerBuildPlugins keeps app plugins on collision and prepends unique callers', () => {
	const appPlugin: EcoBuildPlugin = { name: 'shared', setup() {} };
	const collidingCaller: EcoBuildPlugin = {
		name: 'shared',
		setup(build) {
			build.onLoad({ filter: /\.ts$/u }, () => undefined);
		},
	};
	const uniqueCaller: EcoBuildPlugin = { name: 'caller-first', setup() {} };

	const merged = mergeCallerBuildPlugins([appPlugin], [collidingCaller, uniqueCaller]);

	assert.equal(merged.length, 2);
	assert.equal(merged[0]?.name, 'caller-first');
	assert.equal(merged[1]?.name, 'shared');
	assert.equal(merged[1]?.setup, appPlugin.setup);
});

test('createServerBuildRequest includes app server plugins and jsx ownership', () => {
	const appConfig = createAppConfig();
	const callerPlugin: EcoBuildPlugin = { name: 'caller-plugin', setup() {} };

	const request = createServerBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
		plugins: [callerPlugin],
	});

	assert.ok(request.plugins?.some((plugin) => plugin.name === 'app-plugin'));
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'caller-plugin'));
	assert.equal(request.plugins?.[0]?.name, 'caller-plugin');
	assert.equal(request.environment, 'server');
	assert.equal(request.target, 'node');
});

test('resolveServerAppBuildPlugins matches createServerBuildRequest app plugin set', () => {
	const appConfig = createAppConfig();
	const request = createServerBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
	});

	assert.deepEqual(
		request.plugins?.map((plugin) => plugin.name),
		resolveServerAppBuildPlugins(appConfig).map((plugin) => plugin.name),
	);
});

test('createBrowserBuildRequest excludes app plugins by name and appends source transforms as plugins', () => {
	const appConfig = createAppConfig();
	const sourceTransform: EcoSourceTransform = { name: 'banner', filter: /\.ts$/u, transform: (code) => code };
	appConfig.sourceTransforms = new Map([[sourceTransform.name, sourceTransform]]);

	const request = createBrowserBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/client.ts'],
		outdir: '/out',
		excludeAppBuildPlugins: ['browser-plugin'],
	});

	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'browser-plugin'));
	const lastPlugin = request.plugins?.[request.plugins.length - 1];
	assert.equal(lastPlugin?.name, 'banner');
	assert.equal(lastPlugin?.transform?.filter, sourceTransform.filter);
	assert.equal(request.target, 'browser');
});

test('browser compilation on the route-module executor keeps browser defaults and filters caller plugins', async () => {
	const appConfig = createAppConfig();
	const request = createBrowserBuildRequest(appConfig, {
		entrypoints: ['/app/client.ts'],
		plugins: [{ name: 'server-only', environments: ['server'], setup() {} }],
	});
	assert.equal(request.environment, 'browser');
	assert.equal(request.target, 'browser');
	assert.equal(request.format, 'esm');
	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'server-only'));
	const { installBuildRuntime, requireBuildRuntime } = await import('./build-runtime.ts');
	const observed: import('../contracts/build-contracts.ts').BuildOptions[] = [];
	appConfig.runtime ??= {};
	appConfig.runtime.buildAdapter = {
		async build(options) {
			observed.push(options);
			return { success: true, outputs: [], logs: [] };
		},
		resolve(specifier) {
			return specifier;
		},
		getTranspileOptions() {
			return { target: 'browser', format: 'esm', sourcemap: 'none' };
		},
	};
	installBuildRuntime(appConfig);
	await requireBuildRuntime(appConfig).getProfile('route-module').build(request);
	assert.equal(observed[0]?.environment, 'browser');
	assert.equal(observed[0]?.target, 'browser');
});
