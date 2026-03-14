import { beforeEach, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../constants.ts';
import { appLogger } from '../global/app-logger.ts';
import { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import { CONFIG_BUILDER_ERRORS, ConfigBuilder } from './config-builder.ts';
import { fileSystem } from '@ecopages/file-system';

const createMockIntegration = (name: string, extensions: string[]): IntegrationPlugin => {
	return new (class extends IntegrationPlugin {
		renderer = vi.fn() as any;
		override extensions: string[];
		constructor() {
			super({ name, extensions });
			this.extensions = extensions;
		}
	})();
};

describe('EcoConfigBuilder', () => {
	let builder: ConfigBuilder;

	beforeEach(() => {
		builder = new ConfigBuilder();
		vi.restoreAllMocks();
	});

	test('should set baseUrl and rootDir', async () => {
		const config = await builder.setBaseUrl('https://example.com').setRootDir('/project').build();

		expect(config.baseUrl).toBe('https://example.com');
		expect(config.rootDir).toBe('/project');
	});

	test('should set default baseUrl it is not set', async () => {
		const config = await builder.setRootDir('/project').build();
		expect(config.baseUrl).toBe(`http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`);
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

	test('should derive semantic html and 404 template paths', async () => {
		vi.spyOn(fileSystem, 'exists').mockImplementation((candidate) => {
			return (
				candidate === path.join('/project', 'src', 'includes', 'html.test1') ||
				candidate === path.join('/project', 'src', 'pages', '404.test2')
			);
		});

		const integrations: IntegrationPlugin[] = [createMockIntegration('test-integration', ['.test1', '.test2'])];
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setIntegrations(integrations)
			.build();

		expect(config.absolutePaths.htmlTemplatePath).toBe(path.join('/project', 'src', 'includes', 'html.test1'));
		expect(config.absolutePaths.error404TemplatePath).toBe(path.join('/project', 'src', 'pages', '404.test2'));
	});

	test('should throw for duplicate semantic html templates', async () => {
		vi.spyOn(fileSystem, 'exists').mockImplementation((candidate) => {
			return (
				candidate === path.join('/project', 'src', 'includes', 'html.test1') ||
				candidate === path.join('/project', 'src', 'includes', 'html.test2')
			);
		});

		const integrations: IntegrationPlugin[] = [createMockIntegration('test-integration', ['.test1', '.test2'])];

		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
		).rejects.toThrow('Multiple html templates found');
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

	test('should set integrations', async () => {
		const integrations: IntegrationPlugin[] = [createMockIntegration('test-integration', ['.test'])];
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setIntegrations(integrations)
			.build();

		expect(config.integrations).toEqual(integrations);
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

		expect(config.templatesExt).toEqual(['.test1', '.test2', '.test3', '.ghtml.ts', '.ghtml.tsx', '.ghtml']);
	});

	test('should throw error for duplicate integration names', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('test-integration', ['.test1']),
			createMockIntegration('test-integration', ['.test2']),
		];
		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
		).rejects.toThrow(CONFIG_BUILDER_ERRORS.DUPLICATE_INTEGRATION_NAMES);
	});

	test('should throw error for duplicate integration extensions', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('test-integration-1', ['.test']),
			createMockIntegration('test-integration-2', ['.test']),
		];
		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
		).rejects.toThrow(CONFIG_BUILDER_ERRORS.DUPLICATE_INTEGRATION_EXTENSIONS);
	});

	test('should warn when both kitajs and react are enabled', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('kitajs', ['.kita.tsx']),
			createMockIntegration('react', ['.tsx']),
		];
		const warnSpy = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);

		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations(integrations).build(),
		).resolves.toBeDefined();

		expect(warnSpy).toHaveBeenCalledWith(CONFIG_BUILDER_ERRORS.MIXED_JSX_ENGINES);
		warnSpy.mockRestore();
	});

	test('should add additionalWatchPaths', async () => {
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setAdditionalWatchPaths(['/additional-path'])
			.build();

		expect(config.additionalWatchPaths).toEqual(['/additional-path']);
	});

	test('should set cache config', async () => {
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setCacheConfig({
				store: 'memory',
				defaultStrategy: 'static',
				enabled: true,
			})
			.build();

		expect(config.cache).toEqual({
			store: 'memory',
			defaultStrategy: 'static',
			enabled: true,
		});
	});

	test('should set cache config with revalidation default', async () => {
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setCacheConfig({
				defaultStrategy: { revalidate: 3600, tags: ['default'] },
			})
			.build();

		expect(config.cache?.defaultStrategy).toEqual({ revalidate: 3600, tags: ['default'] });
	});

	test('should set experimental unsafe config', async () => {
		const config = await builder
			.setBaseUrl('https://example.com')
			.setRootDir('/project')
			.setExperimental({ unsafe: { featureFlag: true } })
			.build();

		expect(config.experimental?.unsafe).toEqual({ featureFlag: true });
	});
});
