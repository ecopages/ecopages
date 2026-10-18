import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	IntegrationPlugin,
	type IntegrationPluginConfig,
	type IntegrationRuntimeContext,
} from './integration-plugin.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { AssetProcessingService } from '../assets/asset-processing-service/asset-processing.service.ts';
import type { IHmrManager } from '../types/public-types.ts';
import type { AssetDefinition } from '../assets/asset-processing-service';
import type { IntegrationRendererRenderOptions, RouteRendererBody } from '../types/public-types.ts';
import { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import { requireAppRuntime } from '../config/assembly/app-runtime.ts';

class NamelessRenderer extends IntegrationRenderer {
	declare name: string;

	override async render(_options: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		return '<div>ok</div>';
	}
}

class TestIntegrationPlugin extends IntegrationPlugin {
	renderer = NamelessRenderer;
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
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', integrations: [plugin] });
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		await expect(plugin.setup({ appConfig, runtime: requireAppRuntime(appConfig) })).resolves.toBeUndefined();
		await expect(plugin.teardown()).resolves.toBeUndefined();
	});

	it('allows integrations to register their HMR strategy from the runtime context', async () => {
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
			tryHandleDevClientRequest: vi.fn(async () => null),
			tryHandleAssetRequest: vi.fn(() => null),
			injectDevClientRuntimes: vi.fn(async (response: Response) => response),
			getDefaultContext: vi.fn(),
			handleFileChange: vi.fn(),
			handleFileChanges: vi.fn(),
		} satisfies IHmrManager;
		const strategy = { matches: vi.fn(() => false), process: vi.fn(), priority: 10, type: 'integration' } as any;
		const pluginWithStrategy = new (class extends TestIntegrationPlugin {
			override hmr({ runtime }: IntegrationRuntimeContext): void {
				runtime.hmr?.registerStrategy(strategy);
			}
		})(config);
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', integrations: [pluginWithStrategy] });
		const runtime = requireAppRuntime(appConfig);
		runtime.hmr = hmrManager;

		pluginWithStrategy.hmr({ appConfig, runtime });

		expect(registerStrategy).toHaveBeenCalledWith(strategy);
	});

	it('stamps the integration name onto the renderer created from its runtime base', async () => {
		const pluginWithRenderer = new (class extends TestIntegrationPlugin {
			override renderer = NamelessRenderer;
		})(config);
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', integrations: [pluginWithRenderer] });
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		await pluginWithRenderer.setup({ appConfig, runtime: requireAppRuntime(appConfig) });

		const renderer = pluginWithRenderer.getRenderer();
		expect(renderer.name).toBe('test-plugin');
	});

	it('shares one app renderer across repeated lookups and forwards HMR attachment', async () => {
		const pluginWithRenderer = new (class extends TestIntegrationPlugin {
			override renderer = NamelessRenderer;
		})(config);
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', integrations: [pluginWithRenderer] });
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		await pluginWithRenderer.setup({ appConfig, runtime: requireAppRuntime(appConfig) });
		const createRenderer = vi.spyOn(pluginWithRenderer, 'createRenderer');

		const first = pluginWithRenderer.getRenderer();
		const second = pluginWithRenderer.getRenderer();

		expect(second).toBe(first);
		expect(createRenderer).toHaveBeenCalledTimes(1);
		await pluginWithRenderer.setup({ appConfig, runtime: requireAppRuntime(appConfig) });
		const rendererAfterSetup = pluginWithRenderer.getRenderer();
		const setRendererHmrManager = vi.spyOn(rendererAfterSetup, 'setHmrManager');
		expect(rendererAfterSetup).not.toBe(first);
		expect(createRenderer).toHaveBeenCalledTimes(2);

		const hmrManager = {} as IHmrManager;
		const runtime = requireAppRuntime(appConfig);
		runtime.hmr = hmrManager;
		pluginWithRenderer.hmr({ appConfig, runtime });

		expect(pluginWithRenderer.getRenderer()).toBe(rendererAfterSetup);
		expect(setRendererHmrManager).toHaveBeenCalledWith(hmrManager);
	});

	it('allows integrations to add renderer options through createRenderer', async () => {
		const pluginWithOverride = new (class extends TestIntegrationPlugin {
			override createRenderer(base: Parameters<IntegrationPlugin['createRenderer']>[0]) {
				return new NamelessRenderer(base);
			}
		})(config);
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', integrations: [pluginWithOverride] });
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		await pluginWithOverride.setup({ appConfig, runtime: requireAppRuntime(appConfig) });

		expect(pluginWithOverride.getRenderer().name).toBe('test-plugin');
	});
});
