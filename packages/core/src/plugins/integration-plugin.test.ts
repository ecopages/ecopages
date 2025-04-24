import { beforeEach, describe, expect, it } from 'bun:test';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';
import type { AssetDependency } from '../services/assets-dependency-service/assets-dependency.service';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin';

class TestIntegrationPlugin extends IntegrationPlugin {
  initializeRenderer(): IntegrationRenderer<any> {
    return {} as IntegrationRenderer<any>;
  }
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
    dependencies: [],
  };

  beforeEach(() => {
    plugin = new TestIntegrationPlugin(config);
  });

  it('should initialize with correct config values', () => {
    expect(plugin.name).toBe(config.name);
    expect(plugin.extensions).toEqual(config.extensions);
    expect(plugin.getDependencies()).toEqual(config.dependencies as AssetDependency[]);
  });

  it('should initialize with empty dependencies if not provided', () => {
    const pluginWithoutDeps = new TestIntegrationPlugin({
      name: 'test',
      extensions: [],
    });
    expect(pluginWithoutDeps.getDependencies()).toEqual([]);
  });

  it('should implement setup and teardown methods', () => {
    expect(plugin.setup()).resolves.toBeUndefined();
    expect(plugin.teardown()).resolves.toBeUndefined();
  });
});
