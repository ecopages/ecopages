import { beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	defaultBuildAdapter,
	getAppBuildAdapter,
	getAppBuildOwnership,
	getAppBuildManifest,
	ViteHostBuildAdapter,
} from '../build/build-adapter.ts';
import { createBrowserRuntimeManifest } from '../build/browser/browser-runtime-manifest.ts';
import { createVitePluginsFromAppSourceTransforms } from '../plugins/source-transform.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../config/constants.ts';
import { appLogger } from '../global/app-logger.ts';
import { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import { Processor } from '../plugins/processor.ts';
import { fileSystem } from '@ecopages/file-system';
import { finalizeEcoPagesConfig } from './finalize-config.ts';
import type { EcoPagesUserConfig } from './user-config-types.ts';

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

const finalize = (userConfig: EcoPagesUserConfig = {}) =>
	finalizeEcoPagesConfig({
		rootDir: '/project',
		integrations: [createMockIntegration('test', ['.test.ts'])],
		...userConfig,
	});

describe('finalizeEcoPagesConfig', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test('should set baseUrl and rootDir', async () => {
		const config = await finalize({ baseUrl: 'https://example.com' });

		expect(config.baseUrl).toBe('https://example.com');
		expect(config.rootDir).toBe('/project');
	});

	test('should set default baseUrl it is not set', async () => {
		vi.stubEnv('ECOPAGES_BASE_URL', undefined);
		const config = await finalize();
		expect(config.baseUrl).toBe(`http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`);
		expect(config.distDir).toBe('dist');
		expect(config.workDir).toBe('.eco');
		expect(config.absolutePaths.distDir).toBe(path.join('/project', 'dist'));
		expect(config.absolutePaths.workDir).toBe(path.join('/project', '.eco'));
	});

	test('should fall back to ECOPAGES_BASE_URL when baseUrl is not set', async () => {
		vi.stubEnv('ECOPAGES_BASE_URL', 'https://env.example.com');
		const config = await finalize();
		expect(config.baseUrl).toBe('https://env.example.com');
	});

	test('should default absolutePaths.config to eco.config.ts in rootDir', async () => {
		const config = await finalize();
		expect(config.absolutePaths.config).toBe(path.join('/project', 'eco.config.ts'));
	});

	test('should honor configFilePath for absolutePaths.config', async () => {
		const config = await finalizeEcoPagesConfig(
			{ rootDir: '/project' },
			{ configFilePath: '/project/config/eco.staging.ts' },
		);

		expect(config.absolutePaths.config).toBe('/project/config/eco.staging.ts');
	});

	test('should resolve a relative rootDir against cwd', async () => {
		const config = await finalizeEcoPagesConfig({ rootDir: 'app' }, { cwd: '/workspace' });
		expect(config.rootDir).toBe(path.join('/workspace', 'app'));
	});

	test('should configure static development prewarm paths', async () => {
		const config = await finalize({ devPrewarmPaths: ['/'] });

		expect(config.devPrewarmPaths).toEqual(['/']);
	});

	test('should configure critical development prewarm paths', async () => {
		const config = await finalize({ devPrewarmBeforeReadyPaths: ['/'] });

		expect(config.devPrewarmBeforeReadyPaths).toEqual(['/']);
	});

	test('should create a dedicated build adapter per app config', async () => {
		const config = await finalize();

		expect(getAppBuildOwnership(config)).toBe('rolldown');
		expect(getAppBuildAdapter(config)).not.toBe(defaultBuildAdapter);
		expect(getAppBuildManifest(config).loaderPlugins).toHaveLength(0);
		expect(config.sourceTransforms.size).toBeGreaterThan(0);
		expect(createVitePluginsFromAppSourceTransforms(config).length).toBeGreaterThan(0);
		expect(config.runtime?.serverInvalidationState).toBeDefined();
		expect(config.runtime?.entrypointDependencyGraph).toBeDefined();
	});

	test('should allow explicit Vite-host build ownership during config build', async () => {
		const config = await finalize({ buildOwnership: 'vite-host' });

		expect(getAppBuildOwnership(config)).toBe('vite-host');
		expect(getAppBuildAdapter(config)).toBeInstanceOf(ViteHostBuildAdapter);
	});

	test('should let the buildOwnership option override the user config', async () => {
		const config = await finalizeEcoPagesConfig(
			{ rootDir: '/project', buildOwnership: 'vite-host' },
			{ buildOwnership: 'rolldown' },
		);

		expect(getAppBuildOwnership(config)).toBe('rolldown');
	});

	test('should allow explicit app-owned source transforms for Vite-oriented bundlers', async () => {
		const config = await finalize({
			baseUrl: 'https://example.com',
			sourceTransforms: [
				{
					name: 'test-source-transform',
					filter: /entry\.tsx$/,
					transform(code) {
						return { code: `/* source transform */\n${code}` };
					},
				},
			],
		});

		expect(config.sourceTransforms.has('test-source-transform')).toBe(true);
		expect(
			createVitePluginsFromAppSourceTransforms(config).some((plugin) => plugin.name === 'test-source-transform'),
		).toBe(true);
	});

	test('should finalize processor and integration manifest contributions during config build', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-finalize-config-'));
		const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
		const processorBrowserPlugin = { name: 'processor-browser-plugin', setup() {} };
		const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
		const integrationBrowserPlugin = { name: 'integration-browser-plugin', setup() {} };

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
			override get browserBuildPlugins() {
				return [integrationBrowserPlugin];
			}
			override get browserRuntimeManifest() {
				return createBrowserRuntimeManifest([
					{
						specifier: 'react',
						owner: '@ecopages/react',
						importPath: 'react',
						publicPath: '/assets/vendors/react.js',
					},
				]);
			}
			override async prepareBuildContributions(): Promise<void> {}
		})({ name: 'test-integration', extensions: ['.test'] });

		try {
			const config = await finalize({
				baseUrl: 'https://example.com',
				rootDir,
				processors: [processor],
				integrations: [integration],
			});

			expect(getAppBuildManifest(config).runtimePlugins).toEqual([
				processorRuntimePlugin,
				integrationRuntimePlugin,
			]);
			expect(getAppBuildManifest(config).browserBundlePlugins).toEqual([
				processorBrowserPlugin,
				integrationBrowserPlugin,
			]);
			expect(getAppBuildManifest(config).browserRuntimeManifest.bySpecifier.get('react')?.publicPath).toBe(
				'/assets/vendors/react.js',
			);
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

		await expect(finalize({ integrations: [integration] })).rejects.toThrow(
			'Cannot enable integration "bun-only-integration" on node: it is Bun-only',
		);
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
			await expect(finalize({ rootDir, processors: [processor] })).rejects.toThrow(
				'Cannot enable processor "future-node-processor" on node',
			);
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

		await expect(finalize({ integrations: [integration] })).rejects.toThrow(
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

		await expect(finalize({ integrations: [integration] })).resolves.toBeDefined();
	});

	test('should set custom directories', async () => {
		const config = await finalize({
			srcDir: 'custom-src',
			pagesDir: 'custom-pages',
			includesDir: 'custom-includes',
			componentsDir: 'custom-components',
			layoutsDir: 'custom-layouts',
			publicDir: 'custom-public',
			distDir: 'custom-dist',
			workDir: 'custom-work',
		});

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

	test('should derive semantic html, 404, and 500 template paths', async () => {
		vi.spyOn(fileSystem, 'exists').mockImplementation((candidate) => {
			return (
				candidate === path.join('/project', 'src', 'includes', 'html.test1') ||
				candidate === path.join('/project', 'src', 'pages', '404.test2') ||
				candidate === path.join('/project', 'src', 'pages', '500.test2')
			);
		});

		const config = await finalize({
			integrations: [createMockIntegration('test-integration', ['.test1', '.test2'])],
		});

		expect(config.absolutePaths.htmlTemplatePath).toBe(path.join('/project', 'src', 'includes', 'html.test1'));
		expect(config.absolutePaths.error404TemplatePath).toBe(path.join('/project', 'src', 'pages', '404.test2'));
		expect(config.absolutePaths.error500TemplatePath).toBe(path.join('/project', 'src', 'pages', '500.test2'));
	});

	test('should throw for duplicate semantic html templates', async () => {
		vi.spyOn(fileSystem, 'exists').mockImplementation((candidate) => {
			return (
				candidate === path.join('/project', 'src', 'includes', 'html.test1') ||
				candidate === path.join('/project', 'src', 'includes', 'html.test2')
			);
		});

		await expect(
			finalize({ integrations: [createMockIntegration('test-integration', ['.test1', '.test2'])] }),
		).rejects.toThrow('Multiple html templates found');
	});

	test('should set robotsTxt', async () => {
		const robotsTxt = {
			preferences: {
				'*': ['/private'],
				Googlebot: ['/public'],
			},
		};
		const config = await finalize({ robotsTxt });

		expect(config.robotsTxt).toEqual(robotsTxt);
	});

	test('should set sitemap with defaults merged', async () => {
		const config = await finalize({ sitemap: { enabled: true, extraUrls: ['/rss.xml'] } });

		expect(config.sitemap).toEqual({
			enabled: true,
			fileName: 'sitemap.xml',
			extraUrls: ['/rss.xml'],
			exclude: [],
		});
	});

	test('should default sitemap to disabled', async () => {
		const config = await finalize();
		expect(config.sitemap).toEqual({
			enabled: false,
			fileName: 'sitemap.xml',
			extraUrls: [],
			exclude: [],
		});
	});

	test('should set integrations', async () => {
		const integrations: IntegrationPlugin[] = [createMockIntegration('test-integration', ['.test'])];
		const config = await finalize({ integrations });

		expect(config.integrations.map((integration) => integration.name)).toEqual(['test-integration', 'html-pages']);
		expect(config.integrations[0]).toBe(integrations[0]);
	});

	test('should set defaultMetadata', async () => {
		const defaultMetadata = {
			title: 'Custom Title',
			description: 'Custom Description',
		};
		const config = await finalize({ defaultMetadata });

		expect(config.defaultMetadata).toEqual(defaultMetadata);
	});

	test('should derive absolutePaths correctly', async () => {
		const config = await finalize({ srcDir: 'custom-src', pagesDir: 'custom-pages' });

		expect(config.absolutePaths.srcDir).toBe(path.join('/project', 'custom-src'));
		expect(config.absolutePaths.pagesDir).toBe(path.join('/project', 'custom-src', 'custom-pages'));
	});

	test('should derive templatesExt correctly', async () => {
		const config = await finalize({
			integrations: [
				createMockIntegration('test-integration', ['.test1']),
				createMockIntegration('test-integration-2', ['.test2', '.test3']),
			],
		});

		expect(config.templatesExt).toEqual(['.test1', '.test2', '.test3', '.html']);
	});

	test('registers only the HTML Pages Integration when the config declares none', async () => {
		const config = await finalize({ integrations: undefined });

		expect(config.integrations.map((integration) => integration.name)).toEqual(['html-pages']);
		expect(config.templatesExt).toEqual(['.html']);
		expect(config.absolutePaths.htmlTemplatePath).toBe(path.join('/project', 'src', 'includes', 'html.html'));
		expect(config.absolutePaths.error404TemplatePath).toBe(path.join('/project', 'src', 'pages', '404.html'));
		expect(config.absolutePaths.error500TemplatePath).toBe(path.join('/project', 'src', 'pages', '500.html'));
	});

	test('leaves .html to a user Integration that owns it', async () => {
		const htmlIntegration = createMockIntegration('custom-html', ['.html']);
		const config = await finalize({ integrations: [htmlIntegration] });

		expect(config.integrations).toEqual([htmlIntegration]);
		expect(config.templatesExt).toEqual(['.html']);
	});

	test('should throw error for duplicate integration names', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('test-integration', ['.test1']),
			createMockIntegration('test-integration', ['.test2']),
		];
		await expect(finalize({ integrations })).rejects.toThrow(
			'Integration names must be unique: "test-integration" is registered twice.',
		);
	});

	test('should explain a clash with the built-in html-pages Integration', async () => {
		await expect(finalize({ integrations: [createMockIntegration('html-pages', ['.custom'])] })).rejects.toThrow(
			'Core registers "html-pages" for .html Pages unless an Integration owns .html; rename yours.',
		);
	});

	test('should throw error for duplicate integration extensions', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('test-integration-1', ['.test']),
			createMockIntegration('test-integration-2', ['.test']),
		];
		await expect(finalize({ integrations })).rejects.toThrow(
			'Integration extensions must be unique: ".test" is registered by more than one Integration.',
		);
	});

	test('should reject an already finalized config and the old loaded-config argument', async () => {
		const finalized = await finalize();

		await expect(finalizeEcoPagesConfig(finalized as unknown as EcoPagesUserConfig)).rejects.toThrow(
			'received an already finalized app config',
		);
		await expect(
			finalizeEcoPagesConfig({ config: {}, configFilePath: '/project/eco.config.ts' } as EcoPagesUserConfig),
		).rejects.toThrow('takes the user config first');
	});

	test('should throw for duplicate processor, loader, and source transform names', async () => {
		const processor = new (class extends Processor {
			buildPlugins = [];
			plugins = [];
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return undefined;
			}
		})({ name: 'twice' });
		const loader = { name: 'twice', setup() {} };
		const sourceTransform = { name: 'twice', filter: /x/, transform: () => undefined };

		await expect(finalize({ processors: [processor, processor] })).rejects.toThrow(
			'Processor with name "twice" already exists',
		);
		await expect(finalize({ loaders: [loader, loader] })).rejects.toThrow(
			'Loader with name "twice" already exists',
		);
		await expect(finalize({ sourceTransforms: [sourceTransform, sourceTransform] })).rejects.toThrow(
			'Source transform with name "twice" already exists',
		);
	});

	test('should only log mixed JSX engine guidance at debug level when both kitajs and react are enabled', async () => {
		const integrations: IntegrationPlugin[] = [
			createMockIntegration('kitajs', ['.kita.tsx']),
			createMockIntegration('react', ['.tsx']),
		];
		const debugSpy = vi.spyOn(appLogger, 'debug').mockReturnValue(appLogger);

		await expect(finalize({ integrations })).resolves.toBeDefined();

		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining('Both kitajs and react integrations are enabled'),
		);
		debugSpy.mockRestore();
	});

	test('should add additionalWatchPaths', async () => {
		const config = await finalize({ additionalWatchPaths: ['/additional-path'] });

		expect(config.additionalWatchPaths).toEqual(['/additional-path']);
	});

	test('should set cache config', async () => {
		const config = await finalize({ cache: { store: 'memory', defaultStrategy: 'static', enabled: true } });

		expect(config.cache).toEqual({
			store: 'memory',
			defaultStrategy: 'static',
			enabled: true,
		});
	});

	test('should set cache config with revalidation default', async () => {
		const config = await finalize({ cache: { defaultStrategy: { revalidate: 3600, tags: ['default'] } } });

		expect(config.cache?.defaultStrategy).toEqual({ revalidate: 3600, tags: ['default'] });
	});

	test('should set experimental unsafe config', async () => {
		const config = await finalize({ experimental: { unsafe: { featureFlag: true } } });

		expect(config.experimental?.unsafe).toEqual({ featureFlag: true });
	});
});
