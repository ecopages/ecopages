import { beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	defaultBuildAdapter,
	getAppBuildAdapter,
	getAppBrowserBuildPlugins,
	getAppBuildManifest,
} from '../build/build-adapter.ts';
import { getAppNodeRuntimeManifest } from '../services/node-runtime-manifest.service.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../constants.ts';
import { appLogger } from '../global/app-logger.ts';
import { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import { Processor } from '../plugins/processor.ts';
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
		vi.unstubAllGlobals();
	});

	test('should set baseUrl and rootDir', async () => {
		const config = await builder.setBaseUrl('https://example.com').setRootDir('/project').build();

		expect(config.baseUrl).toBe('https://example.com');
		expect(config.rootDir).toBe('/project');
	});

	test('should set default baseUrl it is not set', async () => {
		const config = await builder.setRootDir('/project').build();
		expect(config.baseUrl).toBe(`http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`);
		expect(config.distDir).toBe('dist');
		expect(config.workDir).toBe('.eco');
		expect(config.absolutePaths.distDir).toBe(path.join('/project', 'dist'));
		expect(config.absolutePaths.workDir).toBe(path.join('/project', '.eco'));
	});

	test('should create a dedicated build adapter and executor per app config', async () => {
		const config = await builder.setRootDir('/project').build();

		expect(config.runtime?.buildExecutor).toBeDefined();
		expect(getAppBuildAdapter(config)).not.toBe(defaultBuildAdapter);
		expect(config.runtime?.buildExecutor).not.toBe(defaultBuildAdapter);
		expect(getAppBuildManifest(config).loaderPlugins.length).toBeGreaterThan(0);
		expect(getAppBrowserBuildPlugins(config).length).toBeGreaterThan(0);
		expect(config.runtime?.devGraphService).toBeDefined();
		expect(config.runtime?.nodeRuntimeManifest).toBeDefined();
		expect(config.runtime?.runtimeSpecifierRegistry).toBeDefined();
		expect(getAppNodeRuntimeManifest(config)).toMatchObject({
			runtime: 'node',
			appRootDir: '/project',
			modulePaths: {
				config: path.join('/project', 'eco.config.ts'),
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});
	});

	test('should finalize processor and integration manifest contributions during config build', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-config-builder-'));
		const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
		const processorBrowserPlugin = { name: 'processor-browser-plugin', setup() {} };
		const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };

		const processor = new (class extends Processor {
			buildPlugins = [processorBrowserPlugin];
			plugins = [processorRuntimePlugin];
			override async prepareBuildContributions(): Promise<void> {}
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return undefined;
			}
		})({ name: 'test-processor' });

		const integration = new (class extends IntegrationPlugin {
			renderer = vi.fn() as any;
			override get plugins() {
				return [integrationRuntimePlugin];
			}
			override async prepareBuildContributions(): Promise<void> {}
		})({ name: 'test-integration', extensions: ['.test'] });

		try {
			const config = await builder
				.setBaseUrl('https://example.com')
				.setRootDir(rootDir)
				.setProcessors([processor])
				.setIntegrations([integration])
				.build();

			expect(getAppBuildManifest(config).runtimePlugins).toEqual([
				processorRuntimePlugin,
				integrationRuntimePlugin,
			]);
			expect(getAppBuildManifest(config).browserBundlePlugins).toEqual([processorBrowserPlugin]);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	test('should reject integrations that require Bun on Node runtime', async () => {
		const integration = new (class extends IntegrationPlugin {
			renderer = vi.fn() as any;
		})({
			name: 'bun-only-integration',
			extensions: ['.bun'],
			runtimeCapability: {
				tags: ['bun-only'],
			},
		});

		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations([integration]).build(),
		).rejects.toThrow('Cannot enable integration "bun-only-integration" on node: it is Bun-only');
	});

	test('should reject processors with incompatible minimum runtime version', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-capability-'));
		const processor = new (class extends Processor {
			buildPlugins = [];
			plugins = [];
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return undefined;
			}
		})({
			name: 'future-node-processor',
			runtimeCapability: {
				tags: ['node-compatible'],
				minRuntimeVersion: '999.0.0',
			},
		});

		try {
			await expect(
				builder.setBaseUrl('https://example.com').setRootDir(rootDir).setProcessors([processor]).build(),
			).rejects.toThrow('Cannot enable processor "future-node-processor" on node');
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	test('should reject invalid minimum runtime version declarations', async () => {
		const integration = new (class extends IntegrationPlugin {
			renderer = vi.fn() as any;
		})({
			name: 'invalid-version-integration',
			extensions: ['.test'],
			runtimeCapability: {
				tags: ['node-compatible'],
				minRuntimeVersion: '18.x',
			},
		});

		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations([integration]).build(),
		).rejects.toThrow(
			'Cannot validate integration "invalid-version-integration" runtimeCapability.minRuntimeVersion "18.x"',
		);
	});

	test('should allow Bun-only integrations when Bun runtime is available', async () => {
		vi.stubGlobal('Bun', { version: '1.3.0' });

		const integration = new (class extends IntegrationPlugin {
			renderer = vi.fn() as any;
		})({
			name: 'bun-runtime-integration',
			extensions: ['.bun'],
			runtimeCapability: {
				tags: ['bun-only'],
				minRuntimeVersion: '1.0.0',
			},
		});

		await expect(
			builder.setBaseUrl('https://example.com').setRootDir('/project').setIntegrations([integration]).build(),
		).resolves.toBeDefined();
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
			.setWorkDir('custom-work')
			.build();

		expect(config.srcDir).toBe('custom-src');
		expect(config.pagesDir).toBe('custom-pages');
		expect(config.includesDir).toBe('custom-includes');
		expect(config.componentsDir).toBe('custom-components');
		expect(config.layoutsDir).toBe('custom-layouts');
		expect(config.publicDir).toBe('custom-public');
		expect(config.distDir).toBe('custom-dist');
		expect(config.workDir).toBe('custom-work');
		expect(config.absolutePaths.workDir).toBe(path.join('/project', 'custom-work'));
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
