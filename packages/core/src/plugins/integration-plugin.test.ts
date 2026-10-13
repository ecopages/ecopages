import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin.ts';
import { AssetProcessingService } from '../services/assets/asset-processing-service/asset-processing.service.ts';
import type { IHmrManager } from '../types/public-types.ts';
import type { AssetDefinition } from '../services/assets/asset-processing-service';
import type { IntegrationRendererRenderOptions, RouteRendererBody } from '../types/public-types.ts';
import { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { ensureIntegrationRuntimeReady } from '../build/app-build-manifest-runtime.ts';

class NamelessRenderer extends IntegrationRenderer {
	declare name: string;

	override async render(_options: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		return '<div>ok</div>';
	}
}

class TestIntegrationPlugin extends IntegrationPlugin {
	renderer = vi.fn() as any;
	override setup(): Promise<void> {
		return Promise.resolve();
	}

	override teardown(): Promise<void> {
		return Promise.resolve();
	}
}

class OverrideInitializeRendererPlugin extends TestIntegrationPlugin {
	override initializeRenderer() {
		const appConfig = this.appConfig as EcoPagesAppConfig;
		const assetProcessingService = new AssetProcessingService(appConfig);
		vi.spyOn(assetProcessingService, 'processDependencies').mockResolvedValue([]);
		const renderer = new NamelessRenderer({
			appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies: [],
			runtimeOrigin: this.runtimeOrigin,
		});

		return this.attachRendererRuntimeServices(renderer);
	}
}

describe('IntegrationPlugin', () => {
	let plugin: TestIntegrationPlugin;
	const config: IntegrationPluginConfig = {
		name: 'test-plugin',
		extensions: ['.test'],
		integrationDependencies: [],
	};

	beforeEach(() => {
		plugin = new TestIntegrationPlugin(config);
	});

	it('should initialize with correct config values', () => {
		expect(plugin.name).toBe(config.name);
		expect(plugin.extensions).toEqual(config.extensions);
		expect(plugin.bundlesPageDependencies).toBe(false);
		expect(plugin.getResolvedIntegrationDependencies()).toEqual(
			config.integrationDependencies as AssetDefinition[],
		);
	});

	it('should initialize with empty dependencies if not provided', () => {
		const pluginWithoutDeps = new TestIntegrationPlugin({
			name: 'test',
			extensions: [],
		});
		expect(pluginWithoutDeps.getResolvedIntegrationDependencies()).toEqual([]);
	});

	it('should implement setup and teardown methods', async () => {
		await expect(plugin.setup()).resolves.toBeUndefined();
		await expect(plugin.teardown()).resolves.toBeUndefined();
	});

	it('should register HMR strategies through the base HMR setup', () => {
		const registerStrategy = vi.fn();
		const hmrManager = {
			registerStrategy,
			registerDevTransformContributor: vi.fn(),
			registerEntrypoint: vi.fn(),
			registerScriptEntrypoint: vi.fn(),
			setEnabled: vi.fn(),
			stop: vi.fn(),
			isEnabled: vi.fn(() => true),
			broadcast: vi.fn(),
			getWatchedFiles: vi.fn(() => new Map()),
			getRegisteredEntrypoints: vi.fn(() => new Map()),
			tryHandleAssetRequest: vi.fn(() => null),
			injectDevClientRuntimes: vi.fn(async (response: Response) => response),
			getDefaultContext: vi.fn(),
			handleFileChange: vi.fn(),
			handleFileChanges: vi.fn(),
		} satisfies IHmrManager;

		const strategy = { matches: vi.fn(() => false), process: vi.fn(), priority: 10, type: 'integration' } as any;
		const pluginWithStrategy = new (class extends TestIntegrationPlugin {
			override getHmrStrategy() {
				return strategy;
			}
		})(config);

		pluginWithStrategy.setHmrManager(hmrManager);

		expect(registerStrategy).toHaveBeenCalledWith(strategy);
	});

	it('should stamp the plugin integration name onto initialized renderers', () => {
		const pluginWithRenderer = new (class extends TestIntegrationPlugin {
			override renderer = NamelessRenderer as TestIntegrationPlugin['renderer'];
		})(config);

		(pluginWithRenderer as TestIntegrationPlugin & { appConfig?: object; runtimeOrigin: string }).appConfig =
			{} as EcoPagesAppConfig;
		pluginWithRenderer.runtimeOrigin = 'http://localhost:3000';

		const renderer = pluginWithRenderer.initializeRenderer();
		expect(renderer.name).toBe('test-plugin');
	});

	it('shares one app renderer until its runtime origin changes', () => {
		const pluginWithRenderer = new (class extends TestIntegrationPlugin {
			override renderer = NamelessRenderer as TestIntegrationPlugin['renderer'];
		})(config);

		const appConfig = {} as EcoPagesAppConfig;
		(pluginWithRenderer as TestIntegrationPlugin & { appConfig?: object; runtimeOrigin: string }).appConfig =
			appConfig;
		pluginWithRenderer.setRuntimeOrigin('http://localhost:3000');
		const initializeRenderer = vi.spyOn(pluginWithRenderer, 'initializeRenderer');

		const first = pluginWithRenderer.getRenderer();
		const second = pluginWithRenderer.getRenderer();

		expect(second).toBe(first);
		expect(initializeRenderer).toHaveBeenCalledTimes(1);
		pluginWithRenderer.setConfig(appConfig);
		expect(pluginWithRenderer.getRenderer()).toBe(first);
		expect(initializeRenderer).toHaveBeenCalledTimes(1);

		pluginWithRenderer.setRuntimeOrigin('http://localhost:3001');

		expect(pluginWithRenderer.getRenderer()).not.toBe(first);
		expect(initializeRenderer).toHaveBeenCalledTimes(2);
	});

	it('should stamp the plugin integration name when overrides use shared renderer runtime services', () => {
		const pluginWithOverride = new OverrideInitializeRendererPlugin(config);

		(pluginWithOverride as TestIntegrationPlugin & { appConfig?: object; runtimeOrigin: string }).appConfig =
			{} as EcoPagesAppConfig;
		pluginWithOverride.runtimeOrigin = 'http://localhost:3000';

		const renderer = pluginWithOverride.initializeRenderer();
		expect(renderer.name).toBe('test-plugin');
	});

	describe('getRenderer', () => {
		function createRendererPlugin() {
			const pluginWithRenderer = new (class extends TestIntegrationPlugin {
				override renderer = NamelessRenderer as TestIntegrationPlugin['renderer'];
			})(config);
			pluginWithRenderer.setConfig({
				absolutePaths: { distDir: '/dist' },
				integrations: [],
			} as unknown as EcoPagesAppConfig);
			pluginWithRenderer.setRuntimeOrigin('http://localhost:3000');
			return pluginWithRenderer;
		}

		it('creates one renderer and hands it to every caller', () => {
			const pluginWithRenderer = createRendererPlugin();
			const initializeRenderer = vi.spyOn(pluginWithRenderer, 'initializeRenderer');

			expect(pluginWithRenderer.getRenderer()).toBe(pluginWithRenderer.getRenderer());
			expect(initializeRenderer).toHaveBeenCalledTimes(1);
		});

		it('keeps the renderer when the runtime origin is set to the value it has', () => {
			const pluginWithRenderer = createRendererPlugin();
			const renderer = pluginWithRenderer.getRenderer();

			pluginWithRenderer.setRuntimeOrigin('http://localhost:3000');

			expect(pluginWithRenderer.getRenderer()).toBe(renderer);
		});

		it('keeps its renderer and asset service when setConfig gets the config it already has', () => {
			const appConfig = { absolutePaths: { distDir: '/dist' }, integrations: [] } as unknown as EcoPagesAppConfig;
			const pluginWithRenderer = new (class extends TestIntegrationPlugin {
				override renderer = NamelessRenderer as TestIntegrationPlugin['renderer'];
			})(config);
			pluginWithRenderer.setConfig(appConfig);
			pluginWithRenderer.setRuntimeOrigin('http://localhost:3000');
			const renderer = pluginWithRenderer.getRenderer();
			const assetProcessingService = pluginWithRenderer['assetProcessingService'];

			pluginWithRenderer.setConfig(appConfig);

			expect(pluginWithRenderer.getRenderer()).toBe(renderer);
			expect(pluginWithRenderer['assetProcessingService']).toBe(assetProcessingService);
		});

		it('keeps the renderer created before runtime activation', async () => {
			const pluginWithRenderer = new (class extends TestIntegrationPlugin {
				override renderer = NamelessRenderer as TestIntegrationPlugin['renderer'];
			})(config);
			const appConfig = {
				absolutePaths: { distDir: '/dist' },
				integrations: [pluginWithRenderer],
			} as unknown as EcoPagesAppConfig;
			pluginWithRenderer.setConfig(appConfig);
			pluginWithRenderer.setRuntimeOrigin('http://localhost:3000');
			const renderer = pluginWithRenderer.getRenderer();

			await ensureIntegrationRuntimeReady({
				appConfig,
				integrationName: pluginWithRenderer.name,
				runtimeOrigin: 'http://localhost:3000',
			});

			expect(pluginWithRenderer.getRenderer()).toBe(renderer);
		});

		it('creates a new renderer after the runtime origin, config or HMR manager changes', () => {
			const pluginWithRenderer = createRendererPlugin();
			const original = pluginWithRenderer.getRenderer();

			pluginWithRenderer.setRuntimeOrigin('http://localhost:3001');
			const afterOrigin = pluginWithRenderer.getRenderer();
			expect(afterOrigin).not.toBe(original);

			pluginWithRenderer.setConfig({
				absolutePaths: { distDir: '/dist' },
				integrations: [],
			} as unknown as EcoPagesAppConfig);
			const afterConfig = pluginWithRenderer.getRenderer();
			expect(afterConfig).not.toBe(afterOrigin);

			pluginWithRenderer.setHmrManager({
				registerStrategy: vi.fn(),
				isEnabled: vi.fn(() => false),
			} as unknown as IHmrManager);
			expect(pluginWithRenderer.getRenderer()).not.toBe(afterConfig);
		});
	});
});
