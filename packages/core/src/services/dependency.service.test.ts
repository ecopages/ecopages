import { beforeEach, describe, expect, it } from 'bun:test';
import { ConfigBuilder } from '../main/config-builder';
import { DependencyHelpers, type DependencyProvider, DependencyService } from './dependency.service';

describe('DependencyService', () => {
  let service: DependencyService;

  beforeEach(async () => {
    service = new DependencyService({
      appConfig: await new ConfigBuilder().setRootDir('test').setBaseUrl('.').build(),
    });
  });

  it('should add and remove providers', async () => {
    const provider: DependencyProvider = {
      name: 'test-provider',
      getDependencies: () => [],
    };

    service.addProvider(provider);
    expect(await service.prepareDependencies()).toEqual([]);

    service.removeProvider('test-provider');
    expect(await service.prepareDependencies()).toEqual([]);
  });

  it('should handle pre-bundled dependencies', async () => {
    const provider: DependencyProvider = {
      name: 'test-provider',
      getDependencies: () => [
        DependencyHelpers.createPreBundledScriptDependency({
          srcUrl: '/dist/test.js',
          attributes: { type: 'module' },
        }),
      ],
    };

    service.addProvider(provider);
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
        DependencyHelpers.createInlineScriptDependency({
          content: inlineContent,
          position: 'head',
        }),
      ],
    };

    service.addProvider(provider);
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
        DependencyHelpers.createPreBundledScriptDependency({
          srcUrl: '/first.js',
          position: 'head',
        }),
        DependencyHelpers.createPreBundledScriptDependency({
          srcUrl: '/second.js',
          position: 'head',
        }),
      ],
    };

    service.addProvider(provider);
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

    service.addProvider(provider1);
    service.addProvider(provider2);

    const deps = await service.prepareDependencies();
    expect(deps).toEqual([]);
  });
});

describe('DependencyHelpers', () => {
  it('should create inline script dependency', () => {
    const dep = DependencyHelpers.createInlineScriptDependency({
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
    const dep = DependencyHelpers.createSrcScriptDependency({
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
    const dep = DependencyHelpers.createInlineStylesheetDependency({
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
    const dep = DependencyHelpers.createSrcStylesheetDependency({
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
