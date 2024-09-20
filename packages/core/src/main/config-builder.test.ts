import { beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { IntegrationPlugin, IntegrationRendererRenderOptions } from '../public-types.ts';
import { IntegrationRenderer } from '../route-renderer/integration-renderer.ts';
import { ConfigBuilder } from './config-builder.ts';

const createMockIntegration = (name: string, extensions: string[]): IntegrationPlugin => {
  return {
    name,
    extensions,
    renderer: class extends IntegrationRenderer {
      name = name;
      async render(_: IntegrationRendererRenderOptions) {
        return '';
      }
    },
  };
};

describe('EcoConfigBuilder', () => {
  let builder: ConfigBuilder;

  beforeEach(() => {
    builder = new ConfigBuilder();
  });

  test('should set baseUrl and rootDir', async () => {
    const config = await builder.setBaseUrl('https://example.com').setRootDir('/project').build();

    expect(config.baseUrl).toBe('https://example.com');
    expect(config.rootDir).toBe('/project');
  });

  test('should throw error if baseUrl is not set', async () => {
    expect(async () => await builder.build()).toThrow();
  });

  test('should set custom directories', async () => {
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setSrcDir('custom-src')
      .setPagesDir('custom-pages')
      .setIncludesDir('custom-includes')
      .setComponentsDir('custom-components')
      .setLayoutsDir('custom-layouts')
      .setPublicDir('custom-public')
      .setDistDir('custom-dist')
      .build();

    expect(config.srcDir).toBe('custom-src');
    expect(config.pagesDir).toBe('custom-pages');
    expect(config.includesDir).toBe('custom-includes');
    expect(config.componentsDir).toBe('custom-components');
    expect(config.layoutsDir).toBe('custom-layouts');
    expect(config.publicDir).toBe('custom-public');
    expect(config.distDir).toBe('custom-dist');
  });

  test('should set includesTemplates', async () => {
    const includesTemplates = {
      head: 'custom-head.ghtml.ts',
      html: 'custom-html.ghtml.ts',
      seo: 'custom-seo.ghtml.ts',
    };
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setIncludesTemplates(includesTemplates)
      .build();

    expect(config.includesTemplates).toEqual(includesTemplates);
  });

  test('should set error404Template', async () => {
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setError404Template('custom-404.ghtml.ts')
      .build();

    expect(config.error404Template).toBe('custom-404.ghtml.ts');
  });

  test('should set robotsTxt', async () => {
    const robotsTxt = {
      preferences: {
        '*': ['/private'],
        Googlebot: ['/public'],
      },
    };
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setRobotsTxt(robotsTxt)
      .build();

    expect(config.robotsTxt).toEqual(robotsTxt);
  });

  test('should set tailwind', async () => {
    const tailwind = { input: 'custom-tailwind.css' };
    const config = await builder.setBaseUrl('https://example.com').setRootDir('/project').setTailwind(tailwind).build();

    expect(config.tailwind).toEqual(tailwind);
  });

  test('should set integrations', async () => {
    const integrations: IntegrationPlugin[] = [createMockIntegration('test-integration', ['.test'])];
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setIntegrations(integrations)
      .build();

    expect(config.integrations).toEqual(integrations);
  });

  test('should set scriptsExtensions', async () => {
    const scriptsExtensions = ['.custom.ts', '.custom.tsx'];
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setScriptsExtensions(scriptsExtensions)
      .build();

    expect(config.scriptsExtensions).toEqual(scriptsExtensions);
  });

  test('should set defaultMetadata', async () => {
    const defaultMetadata = {
      title: 'Custom Title',
      description: 'Custom Description',
    };
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setDefaultMetadata(defaultMetadata)
      .build();

    expect(config.defaultMetadata).toEqual(defaultMetadata);
  });

  test('should derive absolutePaths correctly', async () => {
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setSrcDir('custom-src')
      .setPagesDir('custom-pages')
      .build();

    expect(config.absolutePaths.srcDir).toBe(path.join('/project', 'custom-src'));
    expect(config.absolutePaths.pagesDir).toBe(path.join('/project', 'custom-src', 'custom-pages'));
  });

  test('should derive templatesExt correctly', async () => {
    const integrations: IntegrationPlugin[] = [
      createMockIntegration('test-integration', ['.test1']),
      createMockIntegration('test-integration-2', ['.test2', '.test3']),
    ];
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setIntegrations(integrations)
      .build();

    expect(config.templatesExt).toEqual(['.test1', '.test2', '.test3', '.ghtml.ts', '.ghtml']);
  });

  test('should throw error for duplicate integration names', async () => {
    const integrations: IntegrationPlugin[] = [
      createMockIntegration('test-integration', ['.test1']),
      createMockIntegration('test-integration', ['.test2']),
    ];
    expect(
      async () =>
        await builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
    ).toThrow('Integrations names must be unique');
  });

  test('should throw error for duplicate integration extensions', async () => {
    const integrations: IntegrationPlugin[] = [
      createMockIntegration('test-integration-1', ['.test']),
      createMockIntegration('test-integration-2', ['.test']),
    ];
    expect(async () =>
      builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
    ).toThrow('Integrations extensions must be unique');
  });

  test('should add additionalWatchPaths', async () => {
    const config = await builder
      .setBaseUrl('https://example.com')
      .setRootDir('/project')
      .setAdditionalWatchPaths(['/additional-path'])
      .build();

    expect(config.additionalWatchPaths).toEqual(['/additional-path']);
  });
});
