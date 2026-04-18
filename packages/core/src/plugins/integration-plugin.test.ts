import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin.ts';
import type { IHmrManager } from '../types/public-types.ts';
import type { AssetDefinition } from '../services/assets/asset-processing-service';
import type { IntegrationRendererRenderOptions, RouteRendererBody } from '../types/public-types.ts';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '../route-renderer/orchestration/integration-renderer.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

class NamelessRenderer extends IntegrationRenderer {
	declare name: string;

	async render(_options: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		return '<div>ok</div>';
	}

	async renderToResponse(_view: never, _props: never, _ctx: RenderToResponseContext): Promise<Response> {
		return new Response('<div>ok</div>');
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
		const renderer = new NamelessRenderer({
			appConfig: this.appConfig as EcoPagesAppConfig,
			assetProcessingService: {} as never,
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
		expect(plugin.runtimeCapability).toBeUndefined();
		expect(plugin.getResolvedIntegrationDependencies()).toEqual(
			config.integrationDependencies as AssetDefinition[],
		);
	});

	it('should retain runtime capability declarations', () => {
		const pluginWithRuntimeCapability = new TestIntegrationPlugin({
			name: 'runtime-capable',
			extensions: ['.test'],
			runtimeCapability: {
				tags: ['bun-only'],
				minRuntimeVersion: '1.0.0',
			},
		});

		expect(pluginWithRuntimeCapability.runtimeCapability).toEqual({
			tags: ['bun-only'],
			minRuntimeVersion: '1.0.0',
		});
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

	it('should register runtime specifier maps through the base HMR setup', () => {
		const registerSpecifierMap = vi.fn();
		const hmrManager = {
			registerSpecifierMap,
			registerStrategy: vi.fn(),
			registerEntrypoint: vi.fn(),
			registerScriptEntrypoint: vi.fn(),
			setPlugins: vi.fn(),
			setEnabled: vi.fn(),
			isEnabled: vi.fn(() => true),
			broadcast: vi.fn(),
			getOutputUrl: vi.fn(),
			getWatchedFiles: vi.fn(() => new Map()),
			getSpecifierMap: vi.fn(() => new Map()),
			getDistDir: vi.fn(() => ''),
			getPlugins: vi.fn(() => []),
			getDefaultContext: vi.fn(),
			handleFileChange: vi.fn(),
		} satisfies IHmrManager;

		const pluginWithRuntimeSpecifiers = new (class extends TestIntegrationPlugin {
			override getRuntimeSpecifierMap(): Record<string, string> {
				return {
					'test-runtime': '/assets/vendors/test-runtime.js',
				};
			}
		})(config);

		pluginWithRuntimeSpecifiers.setHmrManager(hmrManager);

		expect(registerSpecifierMap).toHaveBeenCalledWith({
			'test-runtime': '/assets/vendors/test-runtime.js',
		});
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

	it('should stamp the plugin integration name when overrides use shared renderer runtime services', () => {
		const pluginWithOverride = new OverrideInitializeRendererPlugin(config);

		(pluginWithOverride as TestIntegrationPlugin & { appConfig?: object; runtimeOrigin: string }).appConfig =
			{} as EcoPagesAppConfig;
		pluginWithOverride.runtimeOrigin = 'http://localhost:3000';

		const renderer = pluginWithOverride.initializeRenderer();
		expect(renderer.name).toBe('test-plugin');
	});
});
