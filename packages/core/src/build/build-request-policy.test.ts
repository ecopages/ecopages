import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAppBuildManifest } from './build-manifest.ts';
import {
	createBrowserBuildRequest,
	createServerBuildRequest,
	mergeCallerBuildPlugins,
	resolveServerAppBuildPlugins,
} from './build-request-policy.ts';
import { setAppBuildManifest } from './build-adapter.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoBuildPlugin } from './build-types.ts';

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
	const browserPlugin: EcoBuildPlugin = { name: 'browser-plugin', setup() {} };

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [appPlugin],
			browserBundlePlugins: [browserPlugin],
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
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
		plugins: [callerPlugin],
	});

	assert.ok(request.plugins?.some((plugin) => plugin.name === 'app-plugin'));
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'caller-plugin'));
	assert.equal(request.plugins?.[0]?.name, 'caller-plugin');
	assert.equal(request.target, 'es2022');
	assert.equal(request.sourceTransforms, undefined);
});

test('resolveServerAppBuildPlugins matches createServerBuildRequest app plugin set', () => {
	const appConfig = createAppConfig();
	const request = createServerBuildRequest(appConfig, {
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
	});

	assert.deepEqual(
		request.plugins?.map((plugin) => plugin.name),
		resolveServerAppBuildPlugins(appConfig).map((plugin) => plugin.name),
	);
});

test('createBrowserBuildRequest excludes app plugins by name and preserves source transforms', () => {
	const appConfig = createAppConfig();

	const request = createBrowserBuildRequest(appConfig, {
		profile: 'browser-script',
		entrypoints: ['/app/client.ts'],
		outdir: '/out',
		excludeAppBuildPlugins: ['browser-plugin'],
	});

	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'browser-plugin'));
	assert.ok(Array.isArray(request.sourceTransforms));
	assert.equal(request.target, 'browser');
});
