import { beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RolldownBuildAdapter } from '../../build/rolldown/rolldown-build-adapter.ts';
import { createBrowserRuntimeManifest } from '../../build/browser/browser-runtime-manifest.ts';
import { requireAppRuntime } from './app-runtime.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import { Processor } from '../../plugins/processor.ts';
import { fileSystem } from '@ecopages/file-system';
import { finalizeEcoPagesConfig } from './finalize-config.ts';
import type { EcoPagesUserConfig } from '../user-config-types.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

const createMockIntegration = (
	name: string,
	extensions: string[],
	plugins: EcoBuildPlugin[] = [],
): IntegrationPlugin => {
	return new (class extends IntegrationPlugin {
		renderer = vi.fn() as any;
		override plugins(): EcoBuildPlugin[] {
			return plugins;
		}
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

describe('finalizeEcoPagesConfig configModuleFiles', () => {
	test.each([
		{ source: 'a config loaded from source', configFile: 'eco.config.ts', scanned: true },
		{ source: 'the emitted production config', configFile: 'dist/.server/eco.config.mjs', scanned: false },
	])('lists the files that $source imports only when it is scanned', async ({ configFile, scanned }) => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-module-files-'));
		try {
			const optionsPath = path.join(rootDir, 'src/options.ts');
			const configFilePath = path.join(rootDir, configFile);
			fs.mkdirSync(path.dirname(optionsPath), { recursive: true });
			fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
			fs.writeFileSync(optionsPath, 'export const options = { a: 1 };\n');
			fs.writeFileSync(
				configFilePath,
				`import { options } from './${path.relative(path.dirname(configFilePath), optionsPath)}';\nexport default { options };\n`,
			);

			const appConfig = await finalizeEcoPagesConfig({ rootDir }, { configFilePath });

			expect(appConfig.absolutePaths.configModuleFiles.sort()).toEqual(
				(scanned ? [configFilePath, optionsPath] : [configFilePath]).sort(),
			);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	test('lists only the default config path for an in-memory config', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-module-files-'));
		try {
			fs.writeFileSync(path.join(rootDir, 'eco.config.ts'), "import './never-scanned';\nexport default {};\n");

			const appConfig = await finalizeEcoPagesConfig({ rootDir });

			expect(appConfig.absolutePaths.configModuleFiles).toEqual([path.join(rootDir, 'eco.config.ts')]);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});

describe('finalizeEcoPagesConfig', () => {
	test('does not run processor setup while finalizing config', async () => {
		const setup = vi.fn(async () => {
			throw new Error('runtime setup should not run during finalization');
		});
		const processor = new (class extends Processor {
			constructor() {
				super({ name: 'runtime-only-processor' });
			}
			override setup = setup;
		})();

		const config = await finalize({ processors: [processor] });

		expect(config.processors.get(processor.name)).toBe(processor);
		expect(setup).not.toHaveBeenCalled();
	});

	test('rejects plugin instances reused through direct config finalization', async () => {
		const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-plugin-owner-first-'));
		const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-plugin-owner-second-'));
		const processor = new (class extends Processor {
			constructor() {
				super({ name: 'shared-processor' });
			}
			async setup() {}
			getConfiguredRootDir() {
				return this.context?.rootDir;
			}
		})();

		try {
			await finalizeEcoPagesConfig({ rootDir: firstRoot, processors: [processor] });

			await expect(finalizeEcoPagesConfig({ rootDir: secondRoot, processors: [processor] })).rejects.toThrow(
				/reused plugin instances for another app.*defineConfig\(\(\) =>/,
			);
			expect(processor.getConfiguredRootDir()).toBeUndefined();
		} finally {
			fs.rmSync(firstRoot, { recursive: true, force: true });
			fs.rmSync(secondRoot, { recursive: true, force: true });
		}
	});

	test('rejects overlapping build plugin names and identifies both Integrations', async () => {
		const integrations = [
			createMockIntegration('first', ['.first'], [{ name: 'shared', environments: ['browser'], setup() {} }]),
			createMockIntegration('second', ['.second'], [{ name: 'shared', environments: ['browser'], setup() {} }]),
		];
		await expect(finalize({ integrations })).rejects.toThrow(
			'Build plugin "shared" for browser is registered by both Integration "first" and Integration "second".',
		);
	});

	test('allows a plugin name registered once per environment', async () => {
		const serverPlugin: EcoBuildPlugin = { name: 'shared', environments: ['server'], setup() {} };
		const browserPlugin: EcoBuildPlugin = { name: 'shared', environments: ['browser'], setup() {} };
		const config = await finalize({
			integrations: [
				createMockIntegration('first', ['.first'], [serverPlugin]),
				createMockIntegration('second', ['.second'], [browserPlugin]),
			],
		});
		expect(requireAppRuntime(config).buildManifest.server).toEqual([serverPlugin]);
		expect(requireAppRuntime(config).buildManifest.browser).toEqual([browserPlugin]);
	});

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

	test('should create a dedicated build adapter per app config', async () => {
		const config = await finalize();
		const runtime = requireAppRuntime(config);

		expect(runtime.buildAdapter).toBeInstanceOf(RolldownBuildAdapter);
		expect(runtime.buildManifest.server).toHaveLength(0);
		expect(runtime.buildManifest.browser).toHaveLength(0);
		expect(runtime).not.toHaveProperty('entrypointDependencyGraph');
	});

	test('should finalize processor and integration manifest contributions during config build', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-finalize-config-'));
		const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
		const processorBrowserPlugin = { name: 'processor-browser-plugin', setup() {} };
		const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
		const integrationBrowserPlugin = { name: 'integration-browser-plugin', setup() {} };

		const processor = new (class extends Processor {
			override plugins(): EcoBuildPlugin[] {
				return [processorRuntimePlugin, processorBrowserPlugin];
			}
			override async setup(): Promise<void> {}
		})({ name: 'test-processor' });

		const integration = new (class extends IntegrationPlugin {
			renderer = vi.fn() as any;
			override plugins() {
				return [integrationRuntimePlugin, integrationBrowserPlugin];
			}
		})({
			name: 'test-integration',
			extensions: ['.test'],
			browserRuntimeManifest: createBrowserRuntimeManifest([
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: '/assets/vendors/react.js',
				},
			]),
		});

		try {
			const config = await finalize({
				baseUrl: 'https://example.com',
				rootDir,
				processors: [processor],
				integrations: [integration],
			});

			const contributed = [
				processorRuntimePlugin,
				processorBrowserPlugin,
				integrationRuntimePlugin,
				integrationBrowserPlugin,
			].map((plugin) => plugin.name);
			const manifest = requireAppRuntime(config).buildManifest;
			expect(manifest.server.map((plugin) => plugin.name)).toEqual(contributed);
			expect(manifest.browser.map((plugin) => plugin.name)).toEqual([...contributed, 'browser-runtime-plugin']);
			expect(manifest.browserRuntimeManifest.bySpecifier.get('react')?.publicPath).toBe(
				'/assets/vendors/react.js',
			);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
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

	test('defaults the metadata title and description and keeps the user fields', async () => {
		expect((await finalize()).defaultMetadata).toEqual({
			title: 'Ecopages',
			description: 'This is a static site generated with Ecopages',
		});
		expect(
			(await finalize({ defaultMetadata: { title: 'Mine', description: 'Mine too', image: '/og.png' } }))
				.defaultMetadata,
		).toEqual({
			title: 'Mine',
			description: 'Mine too',
			image: '/og.png',
		});
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

	test('resolves semantic templates from the production map when sources are gone', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-semantic-from-map-'));
		try {
			const serverOutdir = path.join(rootDir, 'dist/.server');
			fs.mkdirSync(serverOutdir, { recursive: true });
			fs.writeFileSync(
				path.join(serverOutdir, 'server-modules.json'),
				`${JSON.stringify({
					modules: {
						'src/includes/html.kita.tsx': 'html.mjs',
						'src/pages/404.html': '404-html.json',
					},
				})}\n`,
			);

			const config = await finalizeEcoPagesConfig({
				rootDir,
				integrations: [createMockIntegration('kitajs', ['.kita.tsx'])],
			});

			expect(config.absolutePaths.htmlTemplatePath).toBe(path.join(rootDir, 'src/includes/html.kita.tsx'));
			expect(config.absolutePaths.error404TemplatePath).toBe(path.join(rootDir, 'src/pages/404.html'));
			expect(config.absolutePaths.error500TemplatePath).toBe(path.join(rootDir, 'src/pages/500.kita.tsx'));
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
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

	test.each([['.api.ts'], ['.api.tsx']])(
		'rejects an Integration that registers the endpoint marker %p',
		async (extension) => {
			await expect(finalize({ integrations: [createMockIntegration('mine', [extension])] })).rejects.toThrow(
				`Integration "mine" registers "${extension}", which is reserved for endpoint files: .api.ts, .api.tsx, .api.js, .api.jsx.`,
			);
		},
	);

	test('accepts an Integration that registers .tsx, the ending of .api.tsx', async () => {
		const config = await finalize({ integrations: [createMockIntegration('mine', ['.tsx'])] });

		expect(config.templatesExt).toEqual(['.tsx', '.html']);
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

	test('should throw for duplicate processor and loader names', async () => {
		const processor = new (class extends Processor {
			override async setup(): Promise<void> {}
		})({ name: 'twice' });
		const loader = { name: 'twice', setup() {} };

		await expect(finalize({ processors: [processor, processor] })).rejects.toThrow(
			'Processor with name "twice" already exists',
		);
		await expect(finalize({ loaders: [loader, loader] })).rejects.toThrow(
			'Loader with name "twice" already exists',
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

	test('carries watch, prewarm, robots and cache fields through unchanged', async () => {
		const robotsTxt = { preferences: { '*': ['/private'], Googlebot: ['/public'] } };
		const cache: EcoPagesUserConfig['cache'] = {
			store: 'memory',
			defaultStrategy: { revalidate: 3600, tags: ['default'] },
			enabled: true,
		};
		const config = await finalize({
			additionalWatchPaths: ['/additional-path'],
			devPrewarmPaths: ['/'],
			robotsTxt,
			cache,
		});

		expect(config).toMatchObject({
			additionalWatchPaths: ['/additional-path'],
			devPrewarmPaths: ['/'],
			robotsTxt,
			cache,
		});
	});
});
