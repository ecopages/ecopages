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
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'preserve-import-meta-for-server-output'));
});

test('createServerBuildRequest keeps import.meta at the source for the directory the output runs from', async () => {
	const appConfig = createAppConfig();
	const transformFor = async (input: { profile?: 'server-entry' | 'route-module'; runtimeOutdir?: string }) => {
		const request = createServerBuildRequest(appConfig, {
			entrypoints: ['/app/src/pages/index.ts'],
			outdir: '/app/.eco/.server-modules',
			...input,
		});
		const plugin = request.plugins?.find(
			(candidate) => candidate.name === 'preserve-import-meta-for-server-output',
		);
		let transform: ((code: string, id: string) => unknown) | undefined;
		await plugin?.setup({
			onResolve() {},
			onLoad() {},
			module() {},
			transform(_options, callback) {
				transform = callback;
			},
		});
		const result = await transform?.('export const url = import.meta.url;', '/app/src/pages/index.ts');
		return typeof result === 'object' && result && 'code' in result ? result.code : result;
	};

	assert.match(String(await transformFor({})), /new URL\("\.\.\/\.\.\/src\/pages\/index\.ts", import\.meta\.url\)/u);
	assert.match(
		String(await transformFor({ profile: 'server-entry', runtimeOutdir: '/app/.server' })),
		/new URL\("\.\.\/src\/pages\/index\.ts", import\.meta\.url\)/u,
	);
});

test('only the server-entry profile reports packages outside the app root', () => {
	const appConfig = createAppConfig();
	const request = (profile: 'server-entry' | 'route-module') =>
		createServerBuildRequest(appConfig, { profile, entrypoints: ['/app/app.ts'], outdir: '/out' });

	assert.equal(request('server-entry').reportPackagesOutsideRoot, true);
	assert.equal(request('route-module').reportPackagesOutsideRoot, undefined);
});

test('resolveServerAppBuildPlugins matches createServerBuildRequest app plugin set', () => {
	const appConfig = createAppConfig();
	const request = createServerBuildRequest(appConfig, {
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
	});

	assert.deepEqual(
		request.plugins
			?.map((plugin) => plugin.name)
			.filter((name) => name !== 'preserve-import-meta-for-server-output'),
		resolveServerAppBuildPlugins(appConfig).map((plugin) => plugin.name),
	);
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'preserve-import-meta-for-server-output'));
});

test('createBrowserBuildRequest excludes app plugins by name and attaches source transforms as plugins', () => {
	const appConfig = createAppConfig();

	const request = createBrowserBuildRequest(appConfig, {
		profile: 'browser-script',
		entrypoints: ['/app/client.ts'],
		outdir: '/out',
		excludeAppBuildPlugins: ['browser-plugin'],
	});

	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'browser-plugin'));
	assert.equal(request.target, 'browser');
});
