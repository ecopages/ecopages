import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin';
import type { AssetDefinition } from '../services/asset-processing-service';

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

	it('should not defer component boundaries by default', () => {
		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'ghtml',
				targetIntegration: 'react',
				component: () => '<div></div>',
			}),
		).toBe(false);
	});
});
