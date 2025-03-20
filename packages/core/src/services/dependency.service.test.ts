import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ConfigBuilder } from 'src/main/config-builder';
import { DependencyHelpers, type DependencyProvider, DependencyService } from './dependency.service';

describe('DependencyService', () => {
  let service: DependencyService;

  beforeEach(async () => {
    service = new DependencyService({
      appConfig: await new ConfigBuilder().setRootDir('test').setBaseUrl('.').build(),
    });
  });

  it('should add and remove providers', () => {
    const provider: DependencyProvider = {
      name: 'test-provider',
      getDependencies: () => [],
    };

    service.addProvider(provider);
    expect(service.getDependencies()).toEqual([]);

    service.removeProvider('test-provider');
    expect(service.getDependencies()).toEqual([]);
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
      inline: true,
      position: 'body',
      content: "console.log('test')",
      attributes: { id: 'test' },
    });
  });

  it('should create src script dependency', () => {
    const dep = DependencyHelpers.createSrcScriptDependency({
      srcUrl: '/test.js',
      attributes: { async: 'true' },
    });

    expect(dep).toEqual({
      kind: 'script',
      position: 'body',
      srcUrl: '/test.js',
      attributes: { async: 'true' },
    });
  });

  it('should create inline stylesheet dependency', () => {
    const dep = DependencyHelpers.createInlineStylesheetDependency({
      content: 'body { color: red; }',
      attributes: { id: 'test-style' },
    });

    expect(dep).toEqual({
      kind: 'stylesheet',
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
      position: 'head',
      srcUrl: '/test.css',
      attributes: { media: 'screen' },
    });
  });
});
