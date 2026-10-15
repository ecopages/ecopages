import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
	createBuildAdapter,
	defaultBuildAdapter,
	getBuildAdapterOwnership,
	sealAppBuildManifest,
	setupAppRuntimePlugins,
	ensureIntegrationRuntimeReady,
} from './build-adapter.ts';
import { RolldownBuildAdapter } from './rolldown/rolldown-build-adapter.ts';
import { createBrowserRuntimeManifest } from './browser/browser-runtime-manifest.ts';
import { BuildInputDependencyIndex } from './cache/build-input-dependency-index.ts';
import { createAppBuildManifest } from './contracts/build-manifest.ts';
import type { EcoBuildPlugin } from './contracts/build-types.ts';

test('defaultBuildAdapter is the RolldownBuildAdapter', () => {
	assert.ok(defaultBuildAdapter instanceof RolldownBuildAdapter);
	assert.equal(defaultBuildAdapter.ownership, 'rolldown');
});

test('createBuildAdapter returns the RolldownBuildAdapter', () => {
	const rolldownAdapter = createBuildAdapter();
	assert.ok(rolldownAdapter instanceof RolldownBuildAdapter);
	assert.equal(rolldownAdapter.ownership, 'rolldown');
});

test('getBuildAdapterOwnership defaults to rolldown when no adapter is provided', () => {
	assert.equal(getBuildAdapterOwnership(undefined), 'rolldown');
	assert.equal(getBuildAdapterOwnership(new RolldownBuildAdapter()), 'rolldown');
});

const registrations = (...plugins: EcoBuildPlugin[]) => plugins.map((plugin) => ({ plugin, source: plugin.name }));

test('the sealed manifest holds the plugins of each environment, so readers do not filter', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin: EcoBuildPlugin = { name: 'browser-plugin', environments: ['browser'], setup() {} };
	const serverPlugin: EcoBuildPlugin = { name: 'server-plugin', environments: ['server'], setup() {} };

	const manifest = createAppBuildManifest(registrations(loaderPlugin, runtimePlugin, browserPlugin, serverPlugin));

	assert.deepEqual(manifest.server, [loaderPlugin, runtimePlugin, serverPlugin]);
	assert.deepEqual(manifest.browser, [loaderPlugin, runtimePlugin, browserPlugin]);
});

test('the sealed browser list puts the runtime plugin between shared and browser-only plugins', () => {
	const shared = { name: 'shared', setup() {} };
	const browserOnly: EcoBuildPlugin = { name: 'browser-only', environments: ['browser'], setup() {} };
	const browserRuntimeManifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);

	const manifest = createAppBuildManifest(registrations(browserOnly, shared), browserRuntimeManifest);

	assert.deepEqual(
		manifest.browser.map((plugin) => plugin.name),
		['shared', 'browser-runtime-plugin', 'browser-only'],
	);
	assert.equal(manifest.browserRuntimeManifest.bySpecifier.get('react')?.publicPath, '/assets/vendors/react.js');
	assert.deepEqual(
		manifest.server.map((plugin) => plugin.name),
		['shared'],
	);
});

test('a manifest without runtime declarations has no runtime plugin', () => {
	const manifest = createAppBuildManifest([]);

	assert.deepEqual(manifest.browser, []);
	assert.deepEqual(manifest.browserRuntimeManifest.assets, []);
});

test('sealing rejects a plugin name registered twice for one environment, naming both sources', () => {
	const first = { name: 'same-name', setup() {} };
	const second = { name: 'same-name', setup() {} };

	assert.throws(
		() =>
			createAppBuildManifest([
				{ plugin: first, source: 'Loader "a"' },
				{ plugin: second, source: 'Processor "b"' },
			]),
		/Build plugin "same-name" for server is registered by both Loader "a" and Processor "b"\./,
	);
});

test('a plugin name may be registered once per environment', () => {
	const serverOnly: EcoBuildPlugin = { name: 'same-name', environments: ['server'], setup() {} };
	const browserOnly: EcoBuildPlugin = { name: 'same-name', environments: ['browser'], setup() {} };

	const manifest = createAppBuildManifest(registrations(serverOnly, browserOnly));

	assert.deepEqual(manifest.server, [serverOnly]);
	assert.deepEqual(manifest.browser, [browserOnly]);
});

test('sealAppBuildManifest gathers loaders, then processor and integration plugins, and seals once', () => {
	const calls: string[] = [];
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const processorBrowserPlugin: EcoBuildPlugin = {
		name: 'processor-browser-plugin',
		environments: ['browser'],
		setup() {},
	};
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		name: 'processor',
		plugins: vi.fn(() => {
			calls.push('processor-plugins');
			return [processorRuntimePlugin, processorBrowserPlugin];
		}),
		setup: vi.fn(async () => {
			throw new Error('finalization must not set a processor up');
		}),
	};
	const integration = {
		name: 'integration',
		plugins: vi.fn(() => {
			calls.push('integration-plugins');
			return [integrationRuntimePlugin];
		}),
		browserRuntimeManifest: createBrowserRuntimeManifest(),
		setConfig: vi.fn(() => calls.push('integration-config')),
		setup: vi.fn(async () => {
			throw new Error('finalization must not set an integration up');
		}),
	};
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		processors: new Map([['processor', processor]]),
		integrations: [integration],
	} as any;

	const manifest = sealAppBuildManifest(appConfig);

	assert.deepEqual(calls, ['processor-plugins', 'integration-config', 'integration-plugins']);
	assert.deepEqual(processor.plugins.mock.calls, [[appConfig]]);
	assert.deepEqual(integration.plugins.mock.calls, [[appConfig]]);
	assert.equal(processor.setup.mock.calls.length, 0);
	assert.equal(integration.setup.mock.calls.length, 0);
	assert.deepEqual(manifest.server, [loaderPlugin, processorRuntimePlugin, integrationRuntimePlugin]);
	assert.deepEqual(manifest.browser, [
		loaderPlugin,
		processorRuntimePlugin,
		integrationRuntimePlugin,
		processorBrowserPlugin,
	]);
});

test('sealAppBuildManifest reports a plugin an integration registers under a loader name', () => {
	const loaderPlugin = { name: 'duplicate', setup() {} };
	const integration = {
		name: 'react',
		plugins: () => [{ name: 'duplicate', setup() {} }],
		browserRuntimeManifest: createBrowserRuntimeManifest(),
		setConfig() {},
	};

	assert.throws(
		() =>
			sealAppBuildManifest({
				loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
				processors: new Map(),
				integrations: [integration],
			} as any),
		/registered by both Loader "duplicate" and Integration "react"/,
	);
});

test('sealAppBuildManifest merges integration browser runtime manifests', () => {
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
	const integrationFor = (name: string, browserRuntimeManifest: typeof reactManifest) => ({
		name,
		plugins: () => [],
		browserRuntimeManifest,
		setConfig() {},
	});
	const appConfig = {
		loaders: new Map(),
		processors: new Map(),
		integrations: [integrationFor('react', reactManifest), integrationFor('router', routerManifest)],
	} as any;

	const manifest = sealAppBuildManifest(appConfig);

	assert.deepEqual(Array.from(manifest.browserRuntimeManifest.bySpecifier.keys()), [
		'react',
		'@ecopages/react-router/browser',
	]);
});

test('setupAppRuntimePlugins runs runtime setup without recomposing manifest contributions', async () => {
	const contributionOrder: string[] = [];
	const watchPaths: string[] = [];
	const buildInputIndex = new BuildInputDependencyIndex();
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		plugins: [processorRuntimePlugin],
		getWatchConfig: () => ({ paths: watchPaths }),
		setup: vi.fn(async () => {
			contributionOrder.push('processor-setup');
			watchPaths.push('/app/src/content');
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

	await setupAppRuntimePlugins({
		appConfig: {
			loaders: new Map([['loader-plugin', loaderPlugin]]),
			processors: new Map([['processor', processor]]),
			integrations: [integration],
			appRuntime: { buildInputIndex },
		} as any,
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.deepEqual(contributionOrder, ['processor-setup']);
	assert.deepEqual(buildInputIndex.recordedWatchPaths(), ['/app/src/content']);
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

	await setupAppRuntimePlugins({
		appConfig: {
			loaders: new Map(),
			processors: new Map([['processor', processor]]),
			integrations: [integration],
			appRuntime: {
				runtimeAssetsPrepared: true,
				integrationActivations: new Map(),
			},
		} as any,
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(processor.setup.mock.calls.length, 0);
	assert.equal(integration.setup.mock.calls.length, 0);
	assert.equal(integration.setConfig.mock.calls.length, 0);
});

test('ensureIntegrationRuntimeReady activates one integration exactly once', async () => {
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const integration = {
		name: 'react',
		plugins: [integrationRuntimePlugin],
		setConfig: vi.fn(),
		setRuntimeOrigin: vi.fn(),
		setup: vi.fn(async () => {}),
	};

	const appConfig = {
		integrations: [integration],
		appRuntime: {
			integrationActivations: new Map(),
		},
	} as any;

	await ensureIntegrationRuntimeReady({
		appConfig,
		integrationName: 'react',
		runtimeOrigin: 'http://localhost:3000',
	});

	await ensureIntegrationRuntimeReady({
		appConfig,
		integrationName: 'react',
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(integration.setup.mock.calls.length, 1);
	assert.ok(appConfig.appRuntime.integrationActivations.has('react'));
});

test('ensureIntegrationRuntimeReady coalesces concurrent callers to one setup', async () => {
	let resolveSetup!: () => void;
	const setupGate = new Promise<void>((resolve) => {
		resolveSetup = resolve;
	});
	const integration = {
		name: 'react',
		plugins: [],
		setConfig: vi.fn(),
		setRuntimeOrigin: vi.fn(),
		setup: vi.fn(async () => {
			await setupGate;
		}),
	};

	const appConfig = {
		integrations: [integration],
		appRuntime: {
			integrationActivations: new Map(),
		},
	} as any;

	const first = ensureIntegrationRuntimeReady({
		appConfig,
		integrationName: 'react',
		runtimeOrigin: 'http://localhost:3000',
	});
	const second = ensureIntegrationRuntimeReady({
		appConfig,
		integrationName: 'react',
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(integration.setup.mock.calls.length, 1);
	resolveSetup();
	await Promise.all([first, second]);
	assert.equal(integration.setup.mock.calls.length, 1);
});

test('ensureIntegrationRuntimeReady evicts failed activation so a later caller can retry', async () => {
	const integration = {
		name: 'react',
		plugins: [],
		setConfig: vi.fn(),
		setRuntimeOrigin: vi.fn(),
		setup: vi.fn().mockRejectedValueOnce(new Error('setup failed')).mockResolvedValueOnce(undefined),
	};

	const appConfig = {
		integrations: [integration],
		appRuntime: {
			integrationActivations: new Map(),
		},
	} as any;

	await assert.rejects(
		() =>
			ensureIntegrationRuntimeReady({
				appConfig,
				integrationName: 'react',
				runtimeOrigin: 'http://localhost:3000',
			}),
		/setup failed/,
	);

	assert.equal(appConfig.appRuntime.integrationActivations.has('react'), false);

	await ensureIntegrationRuntimeReady({
		appConfig,
		integrationName: 'react',
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(integration.setup.mock.calls.length, 2);
	assert.ok(appConfig.appRuntime.integrationActivations.has('react'));
});

test('setupAppRuntimePlugins skips processor setup in Lit static-render worker threads', async () => {
	vi.stubEnv('ECOPAGES_LIT_STATIC_RENDER_WORKER', 'true');

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

	await setupAppRuntimePlugins({
		appConfig: {
			loaders: new Map(),
			processors: new Map([['processor', processor]]),
			integrations: [integration],
			appRuntime: {
				runtimeAssetsPrepared: false,
				integrationActivations: new Map(),
			},
		} as any,
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(processor.setup.mock.calls.length, 0);
	assert.equal(integration.setup.mock.calls.length, 0);
	assert.equal(integration.setConfig.mock.calls.length, 0);
});
