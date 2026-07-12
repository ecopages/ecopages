import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
	build,
	collectConfiguredAppBuildManifestContributions,
	createConfiguredAppBuildManifest,
	createBuildAdapter,
	defaultBuildAdapter,
	getAppBuildOwnership,
	getAppBuildAdapter,
	getAppBuildManifest,
	getAppBrowserBuildPlugins,
	getDefaultBuildAdapter,
	getAppServerBuildPlugins,
	setAppBuildAdapter,
	setAppBuildOwnership,
	setAppBuildManifest,
	setupAppRuntimePlugins,
	updateAppBuildManifest,
	withBuildExecutorPlugins,
	ViteHostBuildAdapter,
} from './build-adapter.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { createBrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import { createAppBuildManifest } from './build-manifest.ts';

test('defaultBuildAdapter is the RolldownBuildAdapter', () => {
	assert.ok(defaultBuildAdapter instanceof RolldownBuildAdapter);
	assert.equal(defaultBuildAdapter.ownership, 'rolldown');
});

test('createBuildAdapter with ownership: "rolldown" returns the RolldownBuildAdapter', () => {
	const rolldownAdapter = createBuildAdapter({ ownership: 'rolldown' });
	assert.ok(rolldownAdapter instanceof RolldownBuildAdapter);
	assert.equal(rolldownAdapter.ownership, 'rolldown');
});

test('createBuildAdapter with no ownership defaults to Rolldown', () => {
	const defaultAdapter = createBuildAdapter();
	assert.ok(defaultAdapter instanceof RolldownBuildAdapter);
});

test('createBuildAdapter with ownership: "vite-host" returns the ViteHostBuildAdapter', () => {
	const viteAdapter = createBuildAdapter({ ownership: 'vite-host' });
	const defaultViteAdapter = getDefaultBuildAdapter('vite-host');

	assert.ok(viteAdapter instanceof ViteHostBuildAdapter);
	assert.equal(viteAdapter.ownership, 'vite-host');
	assert.ok(defaultViteAdapter instanceof ViteHostBuildAdapter);
	assert.equal(defaultViteAdapter.ownership, 'vite-host');
});

test('ViteHostBuildAdapter rejects core-owned execution attempts', async () => {
	const adapter = new ViteHostBuildAdapter();

	await assert.rejects(
		adapter.build({
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
	assert.throws(() => adapter.resolve('react', '/tmp'), /Vite-hosted builds are owned by the host runtime/);
	assert.throws(
		() => adapter.getTranspileOptions('browser-script'),
		/Vite-hosted builds are owned by the host runtime/,
	);
});

test('build helper accepts an explicit executor across package and relative build-adapter imports', async () => {
	const packageBuildAdapter = await import('@ecopages/core/build/build-adapter');
	const executor = {
		build: vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/shared.js' }],
		})),
	};

	const result = await packageBuildAdapter.build(
		{
			entrypoints: ['/tmp/shared.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		},
		executor,
	);

	assert.equal(result.success, true);
	assert.deepEqual(result.outputs, [{ path: '/tmp/shared.js' }]);
	assert.equal(executor.build.mock.calls.length, 1);
});

test('build helper uses the shared adapter when no executor is provided', async () => {
	const executor = {
		build: vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/direct.js' }],
		})),
	};
	const adapterSpy = vi.spyOn(defaultBuildAdapter, 'build').mockImplementation(executor.build);

	const result = await build({
		entrypoints: ['/tmp/direct.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
		splitting: false,
		minify: false,
	});

	assert.equal(result.success, true);
	assert.deepEqual(result.outputs, [{ path: '/tmp/direct.js' }]);
	assert.equal(adapterSpy.mock.calls.length, 1);
});

test('getAppBuildAdapter returns the app-owned adapter before the shared default adapter', async () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as never;
	const appAdapter = new RolldownBuildAdapter();

	setAppBuildAdapter(appConfig, appAdapter);

	assert.equal(getAppBuildAdapter(appConfig), appAdapter);
	assert.equal(getAppBuildOwnership(appConfig), 'rolldown');
	assert.notEqual(getAppBuildAdapter(appConfig), defaultBuildAdapter);
});

test('getAppBuildAdapter falls back to the explicit Vite-host adapter when ownership is host-owned', () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as any;

	setAppBuildOwnership(appConfig, 'vite-host');

	assert.equal(getAppBuildOwnership(appConfig), 'vite-host');
	assert.ok(getAppBuildAdapter(appConfig) instanceof ViteHostBuildAdapter);
});

test('getAppBuildOwnership defaults to rolldown when no adapter and no ownership are set', () => {
	const appConfig = { runtime: {}, loaders: new Map() } as never;
	assert.equal(getAppBuildOwnership(appConfig), 'rolldown');
	assert.ok(getAppBuildAdapter(appConfig) instanceof RolldownBuildAdapter);
});

test('withBuildExecutorPlugins does not wrap when there are no app plugins to inject', async () => {
	const adapter = {
		build: vi.fn(async () => ({ success: true, logs: [], outputs: [] })),
		resolve: vi.fn(),
		getTranspileOptions: vi.fn(),
	};
	const executor = withBuildExecutorPlugins(adapter, () => []);
	await executor.build({
		entrypoints: ['/tmp/entry.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'browser',
		format: 'esm',
		sourcemap: 'none',
	});
	assert.equal(adapter.build.mock.calls.length, 1, 'no extra wrapping layer is invoked');
});

test('withBuildExecutorPlugins injects app-owned plugins into builds', async () => {
	const plugin = {
		name: 'app-owned-plugin',
		setup() {},
	};
	const adapter = {
		build: vi.fn(async (options: { outdir?: string } & Record<string, unknown>) => ({
			success: true,
			logs: [],
			outputs: [{ path: options.outdir ? `${options.outdir}/entry.js` : '/tmp/entry.js' }],
		})),
		resolve: vi.fn(),
		getTranspileOptions: vi.fn(),
	};
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as never;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [plugin],
		}),
	);
	const executor = withBuildExecutorPlugins(adapter, () => getAppServerBuildPlugins(appConfig));

	await executor.build({
		entrypoints: ['/tmp/entry.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
		splitting: false,
		minify: false,
	});

	assert.equal(adapter.build.mock.calls.length, 1);
	const firstCall = adapter.build.mock.calls[0];
	assert.ok(firstCall);
	assert.deepEqual((firstCall[0] as { plugins?: unknown[] }).plugins, [plugin]);
});

test('build manifest separates server and browser plugin sets', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as any;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			loaderPlugins: [loaderPlugin],
			runtimePlugins: [runtimePlugin],
			browserBundlePlugins: [browserPlugin],
		}),
	);

	assert.deepEqual(getAppBuildManifest(appConfig).loaderPlugins, [loaderPlugin]);
	assert.deepEqual(getAppServerBuildPlugins(appConfig), [loaderPlugin, runtimePlugin]);
	assert.deepEqual(getAppBrowserBuildPlugins(appConfig), [loaderPlugin, runtimePlugin, browserPlugin]);
});

test('createConfiguredAppBuildManifest defaults loader plugins from app config', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {},
	} as any;

	const manifest = createConfiguredAppBuildManifest(appConfig, {
		runtimePlugins: [runtimePlugin],
	});

	assert.deepEqual(manifest.loaderPlugins, [loaderPlugin]);
	assert.deepEqual(manifest.runtimePlugins, [runtimePlugin]);
	assert.deepEqual(manifest.browserBundlePlugins, []);
	assert.deepEqual(manifest.browserRuntimeManifest.assets, []);
});

test('createConfiguredAppBuildManifest preserves explicit browser runtime manifest input', () => {
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as any;
	const browserRuntimeManifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);

	const manifest = createConfiguredAppBuildManifest(appConfig, {
		browserRuntimeManifest,
	});

	assert.equal(manifest.browserRuntimeManifest.bySpecifier.get('react')?.publicPath, '/assets/vendors/react.js');
});

test('updateAppBuildManifest rebuilds the app manifest from config-owned loaders and explicit runtime plugins', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {},
	} as any;

	updateAppBuildManifest(appConfig, {
		runtimePlugins: [runtimePlugin],
		browserBundlePlugins: [browserPlugin],
	});

	assert.deepEqual(getAppBuildManifest(appConfig).loaderPlugins, [loaderPlugin]);
	assert.deepEqual(getAppServerBuildPlugins(appConfig), [loaderPlugin, runtimePlugin]);
	assert.deepEqual(getAppBrowserBuildPlugins(appConfig), [loaderPlugin, runtimePlugin, browserPlugin]);
});

test('collectConfiguredAppBuildManifestContributions gathers processor and integration contributions during config build', async () => {
	const contributionOrder: string[] = [];
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const processorBrowserPlugin = { name: 'processor-browser-plugin', setup() {} };
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		plugins: [processorRuntimePlugin],
		buildPlugins: [processorBrowserPlugin],
		prepareBuildContributions: vi.fn(async () => {
			contributionOrder.push('processor-prepare');
		}),
	};
	const integration = {
		plugins: [integrationRuntimePlugin],
		setConfig: vi.fn(() => contributionOrder.push('integration-config')),
		prepareBuildContributions: vi.fn(async () => {
			contributionOrder.push('integration-prepare');
		}),
	};

	const contributions = await collectConfiguredAppBuildManifestContributions({
		processors: new Map([['processor', processor]]),
		integrations: [integration],
	} as any);

	assert.deepEqual(contributionOrder, ['processor-prepare', 'integration-config', 'integration-prepare']);
	assert.deepEqual(contributions.runtimePlugins, [processorRuntimePlugin, integrationRuntimePlugin]);
	assert.deepEqual(contributions.browserBundlePlugins, [processorBrowserPlugin]);
	assert.equal(contributions.browserRuntimeManifest.assets.length, 0);
});

test('collectConfiguredAppBuildManifestContributions merges integration browser runtime manifests', async () => {
	const reactManifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);
	const routerManifest = createBrowserRuntimeManifest([
		{
			specifier: '@ecopages/react-router/browser',
			owner: '@ecopages/react-router',
			importPath: '@ecopages/react-router/browser',
			publicPath: '/assets/vendors/react-router.js',
		},
	]);

	const contributions = await collectConfiguredAppBuildManifestContributions({
		processors: new Map(),
		integrations: [
			{
				setConfig() {},
				prepareBuildContributions: vi.fn(async () => {}),
				get plugins() {
					return [];
				},
				get browserBuildPlugins() {
					return [];
				},
				get browserRuntimeManifest() {
					return reactManifest;
				},
			},
			{
				setConfig() {},
				prepareBuildContributions: vi.fn(async () => {}),
				get plugins() {
					return [];
				},
				get browserBuildPlugins() {
					return [];
				},
				get browserRuntimeManifest() {
					return routerManifest;
				},
			},
		],
	} as any);

	assert.deepEqual(Array.from(contributions.browserRuntimeManifest.bySpecifier.keys()), [
		'react',
		'@ecopages/react-router/browser',
	]);
});

test('getAppBrowserBuildPlugins adds the app-level browser runtime rewrite plugin when the manifest is populated', () => {
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as any;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			browserRuntimeManifest: createBrowserRuntimeManifest([
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: '/assets/vendors/react.js',
				},
			]),
		}),
	);

	assert.ok(getAppBrowserBuildPlugins(appConfig).some((plugin) => plugin.name === 'browser-runtime-plugin'));
});

test('getAppBrowserBuildPlugins excludes plugins that are registered as source transforms', () => {
	const metaTransform = {
		name: 'eco-component-meta-plugin',
		filter: /\.tsx$/,
		transform: () => undefined,
	};
	const loaderPlugin = { name: 'eco-component-meta-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		sourceTransforms: new Map([[metaTransform.name, metaTransform]]),
		runtime: {},
	} as any;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			loaderPlugins: [loaderPlugin],
			browserBundlePlugins: [browserPlugin],
		}),
	);

	assert.deepEqual(
		getAppBrowserBuildPlugins(appConfig).map((plugin) => plugin.name),
		['browser-plugin'],
	);
});

test('setupAppRuntimePlugins runs runtime setup without recomposing manifest contributions', async () => {
	const contributionOrder: string[] = [];
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		plugins: [processorRuntimePlugin],
		setup: vi.fn(async () => {
			contributionOrder.push('processor-setup');
		}),
	};
	const integration = {
		plugins: [integrationRuntimePlugin],
		setConfig: vi.fn(() => contributionOrder.push('integration-config')),
		setRuntimeOrigin: vi.fn(() => contributionOrder.push('integration-origin')),
		setHmrManager: vi.fn(() => contributionOrder.push('integration-hmr')),
		setup: vi.fn(async () => {
			contributionOrder.push('integration-setup');
		}),
	};
	const observedRuntimePlugins: string[] = [];

	await setupAppRuntimePlugins({
		appConfig: {
			loaders: new Map([['loader-plugin', loaderPlugin]]),
			processors: new Map([['processor', processor]]),
			integrations: [integration],
		} as any,
		runtimeOrigin: 'http://localhost:3000',
		onRuntimePlugin: (plugin) => observedRuntimePlugins.push(plugin.name),
	});

	assert.deepEqual(contributionOrder, [
		'processor-setup',
		'integration-config',
		'integration-origin',
		'integration-setup',
	]);
	assert.deepEqual(observedRuntimePlugins, [
		'loader-plugin',
		'processor-runtime-plugin',
		'integration-runtime-plugin',
	]);
});

test('setupAppRuntimePlugins skips processor and integration setup when runtime assets are already prepared', async () => {
	const processor = {
		plugins: [{ name: 'processor-runtime-plugin', setup() {} }],
		setup: vi.fn(async () => {}),
	};
	const integration = {
		plugins: [{ name: 'integration-runtime-plugin', setup() {} }],
		setConfig: vi.fn(),
		setRuntimeOrigin: vi.fn(),
		setHmrManager: vi.fn(),
		setup: vi.fn(async () => {}),
	};
	const observedRuntimePlugins: string[] = [];

	await setupAppRuntimePlugins({
		appConfig: {
			loaders: new Map(),
			processors: new Map([['processor', processor]]),
			integrations: [integration],
			runtime: { runtimeAssetsPrepared: true },
		} as any,
		runtimeOrigin: 'http://localhost:3000',
		onRuntimePlugin: (plugin) => observedRuntimePlugins.push(plugin.name),
	});

	assert.equal(processor.setup.mock.calls.length, 0);
	assert.equal(integration.setup.mock.calls.length, 0);
	assert.equal(integration.setConfig.mock.calls.length, 0);
	assert.deepEqual(observedRuntimePlugins, ['processor-runtime-plugin', 'integration-runtime-plugin']);
});
