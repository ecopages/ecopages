import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { hashBrowserAssetBytes } from '../../../hashed-browser-asset.ts';
import { FileScriptProcessor } from './file-script.processor';
import type { EcoPagesAppConfig, IHmrManager } from '../../../../../types/internal-types';
import type { FileScriptAsset } from '../../assets.types';

const originalReadFileSync = fileSystem.readFileSync;
const originalCopyFile = fileSystem.copyFile;
const originalExists = fileSystem.exists;
const originalWrite = fileSystem.write;
const originalEnsureDir = fileSystem.ensureDir;

const createMockConfig = (): EcoPagesAppConfig =>
	({
		rootDir: '/test/project',
		srcDir: 'src',
		distDir: '.eco/public',
		absolutePaths: {
			distDir: '/test/project/.eco/public',
			srcDir: '/test/project/src',
		},
		processors: new Map(),
		loaders: new Map(),
	}) as unknown as EcoPagesAppConfig;

describe('FileScriptProcessor', () => {
	let readFileSyncMock: any;
	let copyFileMock: any;
	let existsMock: any;
	let writeMock: any;
	let ensureDirMock: any;

	beforeEach(() => {
		readFileSyncMock = vi.fn(() => 'console.log("test");');
		copyFileMock = vi.fn(() => {});
		existsMock = vi.fn(() => false);
		writeMock = vi.fn(() => {});
		ensureDirMock = vi.fn(() => {});
		fileSystem.readFileSync = readFileSyncMock;
		fileSystem.copyFile = copyFileMock;
		fileSystem.exists = existsMock;
		fileSystem.write = writeMock;
		fileSystem.ensureDir = ensureDirMock;
		vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		fileSystem.readFileSync = originalReadFileSync;
		fileSystem.copyFile = originalCopyFile;
		fileSystem.exists = originalExists;
		fileSystem.write = originalWrite;
		fileSystem.ensureDir = originalEnsureDir;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe('setHmrManager', () => {
		test('should accept an HMR manager', () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint: async () => '/hmr/script.js',
			} as unknown as IHmrManager;

			expect(() => processor.setHmrManager(HmrManager)).not.toThrow();
		});
	});

	describe('process', () => {
		test('should reuse an existing HMR artifact without blocking on registration', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const registerScriptEntrypoint = vi.fn(async () => '/assets/__eco_dev__/script.js');
			const scriptPath = '/test/project/src/script.ts';
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint,
				getRuntimeWorkDir: () => '/test/project/.eco/public/assets/hmr-runtime',
				getWatchedFiles: () => new Map([[scriptPath, '/assets/__eco_dev__/script.js']]),
				getResolvedScriptOutput: () => ({
					outputUrl: '/assets/__eco_dev__/script.js',
					outputPath: scriptPath,
				}),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: scriptPath,
				inline: false,
			};

			const result = await processor.process(dep);

			expect(registerScriptEntrypoint).not.toHaveBeenCalled();
			expect(result.srcUrl).toBe('/assets/__eco_dev__/script.js');
			expect(result.filepath).toBe(scriptPath);
		});

		test('should register stale on-disk HMR artifacts that are not yet watched', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const registerScriptEntrypoint = vi.fn(async () => '/assets/__eco_dev__/script.js');
			const scriptPath = '/test/project/src/script.ts';
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint,
				getRuntimeWorkDir: () => '/test/project/.eco/public/assets/hmr-runtime',
				getWatchedFiles: () => new Map(),
				getResolvedScriptOutput: () => undefined,
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: scriptPath,
				inline: false,
			};

			await processor.process(dep);

			expect(registerScriptEntrypoint).toHaveBeenCalledWith(scriptPath);
		});

		test('should delegate to HMR manager when enabled and not inline and preserve excludeFromHtml', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint: vi.fn(async () => ({
					sourcePath: '/test/project/src/script.ts',
					outputUrl: '/assets/__eco_dev__/script.js',
					outputPath: '/test/project/src/script.ts',
				})),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: false,
				excludeFromHtml: true,
			};

			const result = await processor.process(dep);

			expect(HmrManager.registerScriptEntrypoint).toHaveBeenCalledWith('/test/project/src/script.ts');
			expect(result.srcUrl).toBe('/assets/__eco_dev__/script.js');
			expect(result.filepath).toBe('/test/project/src/script.ts');
			expect(result.inline).toBe(false);
			expect(result.excludeFromHtml).toBe(true);
		});

		test('should preserve excludeFromHtml: false when delegating to HMR manager', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint: vi.fn(async () => ({
					sourcePath: '/test/project/src/script.ts',
					outputUrl: '/assets/__eco_dev__/script.js',
					outputPath: '/test/project/src/script.ts',
				})),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: false,
				excludeFromHtml: false,
			};

			const result = await processor.process(dep);

			expect(HmrManager.registerScriptEntrypoint).toHaveBeenCalledWith('/test/project/src/script.ts');
			expect(result.srcUrl).toBe('/assets/__eco_dev__/script.js');
			expect(result.inline).toBe(false);
			expect(result.excludeFromHtml).toBe(false);
		});

		test('should propagate HMR registration failures instead of falling back to static assets', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint: vi.fn(async () => {
					throw new Error('[HMR] Failed to register script entrypoint');
				}),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: false,
			};

			await expect(processor.process(dep)).rejects.toThrow(/Failed to register script entrypoint/);
		});

		test('should not use HMR when inline is true', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				registerScriptEntrypoint: vi.fn(async () => '/hmr/script.js'),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: true,
				bundle: false,
			};

			const result = await processor.process(dep);

			expect(HmrManager.registerScriptEntrypoint).not.toHaveBeenCalled();
			expect(result.inline).toBe(true);
			expect(result.content).toBeDefined();
		});

		test('should write a bundle: false script under a hash of its bytes even when HMR is enabled', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				getResolvedScriptOutput: vi.fn(),
				registerScriptEntrypoint: vi.fn(),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);

			const result = await processor.process({
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/vendor/jquery.js',
				bundle: false,
				inline: false,
			});

			expect(HmrManager.getResolvedScriptOutput).not.toHaveBeenCalled();
			expect(HmrManager.registerScriptEntrypoint).not.toHaveBeenCalled();
			expect(copyFileMock).not.toHaveBeenCalled();
			expect(result.filepath).toBe(
				`/test/project/.eco/public/assets/${hashBrowserAssetBytes('console.log("test");')}.js`,
			);
			expect(result.inline).toBe(false);
		});

		test('should compile a classic script itself, outside the ES-module HMR pipeline', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const HmrManager = {
				isEnabled: () => true,
				getResolvedScriptOutput: vi.fn(),
				registerScriptEntrypoint: vi.fn(),
			} as unknown as IHmrManager;
			processor.setHmrManager(HmrManager);
			readFileSyncMock.mockReturnValue('function greet(name: string): string { return name; }');
			const write = vi.spyOn(fileSystem, 'write').mockImplementation(() => {});

			const result = await processor.process({
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/pages/classic.ts',
				inline: false,
				classic: true,
			});

			expect(HmrManager.registerScriptEntrypoint).not.toHaveBeenCalled();
			expect(result.filepath).toMatch(/pages\/classic\.js$/);
			expect(write).toHaveBeenCalledWith(result.filepath, expect.stringContaining('function greet('));
		});

		test('should reject a classic script that cannot be one, whoever sets classic', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			readFileSyncMock.mockReturnValue('const node = <div />;');

			await expect(
				processor.process({
					kind: 'script',
					source: 'file',
					filepath: '/test/project/src/w.tsx',
					classic: true,
				}),
			).rejects.toThrow('/test/project/src/w.tsx cannot be used as a classic script: it is JSX.');
		});

		test('should write a bundle: false script under a hash of its bytes', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/scripts/app.js',
				bundle: false,
				inline: false,
			};

			const result = await processor.process(dep);

			expect(copyFileMock).not.toHaveBeenCalled();
			expect(result.filepath).toBe(
				`/test/project/.eco/public/assets/${hashBrowserAssetBytes('console.log("test");')}.js`,
			);
			expect(result.kind).toBe('script');
			expect(result.inline).toBe(false);
		});

		test('should return consistent result when called multiple times with same file', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/scripts/cached.js',
				bundle: false,
				inline: false,
			};

			const result1 = await processor.process(dep);
			const result2 = await processor.process(dep);

			expect(result1).toEqual(result2);
		});

		test('should include content when inline is true and bundle is false', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/inline.js',
				bundle: false,
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.inline).toBe(true);
			expect(result.content).toBe('console.log("test");');
			expect(result.filepath).toBeUndefined();
		});

		test('should preserve attributes from dependency', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.js',
				bundle: false,
				attributes: { defer: 'true', 'data-custom': 'value' },
			};

			const result = await processor.process(dep);

			expect(result.attributes).toEqual({ defer: 'true', 'data-custom': 'value' });
		});

		test('should preserve position from dependency', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.js',
				bundle: false,
				position: 'head',
			};

			const result = await processor.process(dep);

			expect(result.position).toBe('head');
		});

		test('should pass bundle plugins through when bundling', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptSpy = vi.spyOn(processor as any, 'bundleScript').mockResolvedValue('/tmp/out.js');
			const customPlugin = {
				name: 'custom-plugin',
				setup() {},
			};

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.tsx',
				bundle: true,
				bundleOptions: {
					plugins: [customPlugin],
				},
			};

			await processor.process(dep);

			expect(bundleScriptSpy).toHaveBeenCalled();
			const buildArgs = bundleScriptSpy.mock.calls[0]?.[0] as { plugins?: Array<{ name?: string }> };
			expect(buildArgs.plugins?.some((plugin) => plugin.name === 'custom-plugin')).toBe(true);
		});

		test('should bundle nested source files into dist assets subdirectories', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptSpy = vi.spyOn(processor as any, 'bundleScript').mockResolvedValue('/tmp/out.js');

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/pages/index.tsx',
				bundle: true,
			};

			await processor.process(dep);

			const buildArgs = bundleScriptSpy.mock.calls[0]?.[0] as { outdir?: string };
			expect(buildArgs.outdir).toBe('/test/project/.eco/public/assets/pages');
		});

		test('should disable splitting for page-owned script bundles by default', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptSpy = vi.spyOn(processor as any, 'bundleScript').mockResolvedValue('/tmp/out.js');

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/pages/index.tsx',
				bundle: true,
				packageRole: 'page-script',
			};

			await processor.process(dep);

			const buildArgs = bundleScriptSpy.mock.calls[0]?.[0] as { splitting?: boolean };
			expect(buildArgs.splitting).toBe(false);
		});

		test('should return updated attributes when cached asset is retrieved with different attributes', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const depWithDefer: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/cached-attrs.js',
				bundle: false,
				attributes: { defer: '' },
				position: 'head',
			};

			const depWithAsync: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/cached-attrs.js',
				bundle: false,
				attributes: { async: '' },
				position: 'body',
			};

			const result1 = await processor.process(depWithDefer);
			const result2 = await processor.process(depWithAsync);

			expect(result1.attributes).toEqual({ defer: '' });
			expect(result1.position).toBe('head');
			expect(result2.attributes).toEqual({ async: '' });
			expect(result2.position).toBe('body');
		});
	});

	describe('processGrouped', () => {
		test('bundles grouped file entries together and maps outputs by entry name', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptsSpy = vi
				.spyOn(processor as never as { bundleScripts: (typeof processor)['bundleScripts'] }, 'bundleScripts')
				.mockResolvedValue(
					new Map([
						['island-a', '/test/project/.eco/public/assets/island-a-hash.js'],
						['island-b', '/test/project/.eco/public/assets/island-b-hash.js'],
					]),
				);

			const results = await processor.processGrouped([
				{
					kind: 'script',
					source: 'file',
					filepath: '/test/project/src/islands/a.tsx',
					groupedBundle: { id: 'ecopages-app-browser-client', entryName: 'island-a' },
				},
				{
					kind: 'script',
					source: 'file',
					filepath: '/test/project/src/islands/b.tsx',
					groupedBundle: { id: 'ecopages-app-browser-client', entryName: 'island-b' },
				},
			]);

			expect(bundleScriptsSpy).toHaveBeenCalledTimes(1);
			expect(results.map((asset) => asset.filepath)).toEqual([
				'/test/project/.eco/public/assets/island-a-hash.js',
				'/test/project/.eco/public/assets/island-b-hash.js',
			]);
			expect(results[0]?.groupedBundle).toEqual({ id: 'ecopages-app-browser-client', entryName: 'island-a' });
		});

		test('rejects a grouped build without an entry output record', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			vi.spyOn(
				processor as never as { bundleScripts: (typeof processor)['bundleScripts'] },
				'bundleScripts',
			).mockResolvedValue(new Map());

			await expect(
				processor.processGrouped([
					{
						kind: 'script',
						source: 'file',
						filepath: '/test/project/src/islands/a.tsx',
						groupedBundle: { id: 'ecopages-app-browser-client', entryName: 'island-a' },
					},
				]),
			).rejects.toThrow('Missing grouped bundle output for island-a');
		});
	});
});
