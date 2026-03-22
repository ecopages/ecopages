import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin';
import type { IHmrManager } from '../public-types';
import type { AssetDefinition } from '../services/assets/asset-processing-service';

class TestIntegrationPlugin extends IntegrationPlugin {
	renderer = vi.fn() as any;
	override setup(): Promise<void> {
		return Promise.resolve();
	}

	override teardown(): Promise<void> {
		return Promise.resolve();
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

	it('should not defer component boundaries by default', () => {
		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'ghtml',
				targetIntegration: 'react',
				component: () => '<div></div>',
			}),
		).toBe(false);
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
});
