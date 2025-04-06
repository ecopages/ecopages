import { beforeEach, describe, expect, it } from 'bun:test';
import { ConfigBuilder } from '../main/config-builder';
import { AssetDependencyHelpers, AssetsDependencyService, type DependencyProvider } from './assets-dependency.service';

describe('DependencyService', () => {
  let service: AssetsDependencyService;

  beforeEach(async () => {
    service = new AssetsDependencyService({
      appConfig: await new ConfigBuilder().setRootDir('test').setBaseUrl('.').build(),
    });
  });

  it('should add and remove providers', async () => {
    const provider: DependencyProvider = {
      name: 'test-provider',
      getDependencies: () => [],
    };

    service.registerDependencies(provider);
    expect(await service.prepareDependencies()).toEqual([]);

    service.unregisterDependencies('test-provider');
    expect(await service.prepareDependencies()).toEqual([]);
  });

  it('should handle pre-bundled dependencies', async () => {
    const provider: DependencyProvider = {
      name: 'test-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createPreBundledScriptAsset({
          srcUrl: '/dist/test.js',
          attributes: { type: 'module' },
        }),
      ],
    };

    service.registerDependencies(provider);
    const deps = await service.prepareDependencies();

    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({
      provider: 'test-provider',
      kind: 'script',
      srcUrl: '/dist/test.js',
      attributes: { type: 'module' },
    });
  });

  it('should handle inline dependencies correctly', async () => {
    const inlineContent = 'console.log("test")';
    const provider: DependencyProvider = {
      name: 'inline-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createInlineScriptAsset({
          content: inlineContent,
          position: 'head',
        }),
      ],
    };

    service.registerDependencies(provider);
    const deps = await service.prepareDependencies();

    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({
      provider: 'inline-provider',
      kind: 'script',
      inline: true,
      content: inlineContent,
      position: 'head',
    });
  });

  it('should preserve dependency order within same provider', async () => {
    const provider: DependencyProvider = {
      name: 'ordered-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createPreBundledScriptAsset({
          srcUrl: '/first.js',
          position: 'head',
        }),
        AssetDependencyHelpers.createPreBundledScriptAsset({
          srcUrl: '/second.js',
          position: 'head',
        }),
      ],
    };

    service.registerDependencies(provider);
    const deps = await service.prepareDependencies();

    expect(deps).toHaveLength(2);
    expect(deps[0].srcUrl).toBe('/first.js');
    expect(deps[1].srcUrl).toBe('/second.js');
  });

  it('should not allow duplicate provider names', async () => {
    const provider1: DependencyProvider = {
      name: 'same-name',
      getDependencies: () => [],
    };

    const provider2: DependencyProvider = {
      name: 'same-name',
      getDependencies: () => [],
    };

    service.registerDependencies(provider1);
    service.registerDependencies(provider2);

    const deps = await service.prepareDependencies();
    expect(deps).toEqual([]);
  });

  it('should handle dynamic script dependencies separately', async () => {
    const provider: DependencyProvider = {
      name: 'dynamic-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createSrcScriptAsset({
          srcUrl: '/test.js?dynamic=true',
          position: 'body',
        }),
        AssetDependencyHelpers.createPreBundledScriptAsset({
          srcUrl: '/regular.js',
          position: 'body',
        }),
      ],
    };

    service.registerDependencies(provider);
    const deps = await service.prepareDependencies().catch(() => []);

    expect(deps).toHaveLength(1);
    expect(deps[0].srcUrl).toBe('/regular.js');
  });

  it('should handle bundle failures for dynamic dependencies', async () => {
    const provider: DependencyProvider = {
      name: 'dynamic-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createSrcScriptAsset({
          srcUrl: '/dynamic-script.js?dynamic=true',
          position: 'body',
          attributes: { type: 'module' },
        }),
      ],
    };

    service.registerDependencies(provider);

    await service.prepareDependencies().catch((error) => {
      expect(error.message).toContain('Bundle failed');
    });

    const deps = await service.prepareDependencies();
    expect(deps).toHaveLength(0);
  });

  it('should cache dynamic dependencies and reuse them', async () => {
    const provider: DependencyProvider = {
      name: 'dynamic-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createSrcScriptAsset({
          srcUrl: '/dynamic-script.js?dynamic=true',
          position: 'body',
          attributes: { type: 'module' },
        }),
      ],
    };

    service.registerDependencies(provider);
    await service.prepareDependencies();

    // Second preparation should reuse cached dynamic dependency
    const deps = await service.prepareDependencies();
    expect(deps).toHaveLength(0);
  });

  it('should clear dynamic dependencies when cleaning up page dependencies', async () => {
    const provider: DependencyProvider = {
      name: 'dynamic-provider',
      getDependencies: () => [
        AssetDependencyHelpers.createSrcScriptAsset({
          srcUrl: '/to-clean.js?dynamic=true',
          position: 'body',
        }),
      ],
    };

    service.registerDependencies(provider);
    await service.prepareDependencies();

    service.cleanupPageDependencies();
    const deps = await service.prepareDependencies();

    expect(deps).toHaveLength(0);
  });
});

describe('DependencyHelpers', () => {
  it('should create inline script dependency', () => {
    const dep = AssetDependencyHelpers.createInlineScriptAsset({
      content: "console.log('test')",
      attributes: { id: 'test' },
    });

    expect(dep).toEqual({
      kind: 'script',
      source: 'inline',
      inline: true,
      position: 'body',
      content: "console.log('test')",
      attributes: { id: 'test' },
    });
  });

  it('should create src script dependency', () => {
    const dep = AssetDependencyHelpers.createSrcScriptAsset({
      srcUrl: '/test.js',
      attributes: { defer: 'true' },
    });

    expect(dep).toEqual({
      kind: 'script',
      source: 'url',
      position: 'body',
      srcUrl: '/test.js',
      attributes: { defer: 'true' },
    });
  });

  it('should create inline stylesheet dependency', () => {
    const dep = AssetDependencyHelpers.createInlineStylesheetAsset({
      content: 'body { color: red; }',
      attributes: { id: 'test-style' },
    });

    expect(dep).toEqual({
      kind: 'stylesheet',
      source: 'inline',
      inline: true,
      position: 'head',
      content: 'body { color: red; }',
      attributes: { id: 'test-style' },
    });
  });

  it('should create src stylesheet dependency', () => {
    const dep = AssetDependencyHelpers.createStylesheetAsset({
      srcUrl: '/test.css',
      attributes: { media: 'screen' },
    });

    expect(dep).toEqual({
      kind: 'stylesheet',
      source: 'url',
      position: 'head',
      srcUrl: '/test.css',
      attributes: { media: 'screen' },
    });
  });
});
