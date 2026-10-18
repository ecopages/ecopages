import path from 'node:path';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { NodeModuleScriptProcessor } from './node-module-script.processor';
import { createAppRuntime } from '../../../../../config/app-runtime';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types';
import type { NodeModuleScriptAsset } from '../../assets.types';

const originalExists = fileSystem.exists;
const originalReadFileAsBuffer = fileSystem.readFileAsBuffer;

const createMockConfig = (): EcoPagesAppConfig => {
	const config = {
		rootDir: '/test/project',
		srcDir: 'src',
		distDir: '.eco/public',
		absolutePaths: {
			distDir: '/test/project/.eco/public',
			srcDir: '/test/project/src',
		},
		processors: new Map(),
		loaders: new Map(),
		integrations: [],
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(config);
	return config;
};

describe('NodeModuleScriptProcessor', () => {
	let existsMock: any;
	let readFileAsBufferMock: any;

	beforeEach(() => {
		existsMock = vi.fn(() => true);
		readFileAsBufferMock = vi.fn(() => Buffer.from('// module content'));
		fileSystem.exists = existsMock;
		fileSystem.readFileAsBuffer = readFileAsBufferMock;
	});

	afterEach(() => {
		fileSystem.exists = originalExists;
		fileSystem.readFileAsBuffer = originalReadFileAsBuffer;
		vi.restoreAllMocks();
	});

	describe('process - inline module', () => {
		test('should return inline content for inline modules', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'some-package/dist/index.js',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.inline).toBe(true);
			expect(result.content).toBe('// module content');
			expect(result.kind).toBe('script');
		});

		test('should preserve attributes for inline modules', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'some-package/dist/index.js',
				inline: true,
				attributes: { type: 'module' },
			};

			const result = await processor.process(dep);

			expect(result.attributes).toEqual({ type: 'module' });
		});

		test('should preserve position for inline modules', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'some-package/dist/index.js',
				inline: true,
				position: 'head',
			};

			const result = await processor.process(dep);

			expect(result.position).toBe('head');
		});
	});

	describe('resolveModulePath', () => {
		test('should throw error when module not found', async () => {
			existsMock = vi.fn(() => false);
			fileSystem.exists = existsMock;

			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'non-existent-package/index.js',
				inline: true,
			};

			await expect(processor.process(dep)).rejects.toThrow(/Could not resolve module/);
		});

		test('should find module in parent directories', async () => {
			const parentModulePath = '/test/node_modules/parent-package/index.js';
			existsMock = vi.fn((candidatePath: string) => candidatePath === parentModulePath);
			fileSystem.exists = existsMock;

			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'parent-package/index.js',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.sourceFilepath).toBe(parentModulePath);
		});

		test('should probe file extensions for installed package subpaths', async () => {
			const modulePath = '/test/project/node_modules/@ecopages/radiant/client/install-hydrator.js';
			existsMock = vi.fn((candidatePath: string) => candidatePath === modulePath);
			fileSystem.exists = existsMock;

			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: '@ecopages/radiant/client/install-hydrator',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.sourceFilepath).toBe(modulePath);
		});
	});

	describe('process - custom name', () => {
		test('should use custom name when provided', async () => {
			vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => undefined);
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'some-package/dist/index.js',
				name: 'custom-vendor',
				inline: false,
				bundle: false,
			};

			const result = await processor.process(dep);

			expect(result.filepath).toBe('/test/project/.eco/public/assets/vendors/custom-vendor');
		});

		test('should preserve explicit bundle naming when provided', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptSpy = vi
				.spyOn(
					processor as unknown as {
						bundleScript: (
							options: Record<string, unknown>,
						) => Promise<{ filepath: string; inputPaths: string[] }>;
					},
					'bundleScript',
				)
				.mockResolvedValue({
					filepath: '/test/project/.eco/public/assets/vendors/react.development.js',
					inputPaths: [],
				});

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'react',
				name: 'react',
				inline: false,
				bundleOptions: {
					naming: 'react.development.js',
				},
			};

			const result = await processor.process(dep);

			expect(bundleScriptSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					naming: 'react.development.js',
				}),
			);
			expect(result.filepath).toBe('/test/project/.eco/public/assets/vendors/react.development.js');
		});

		test('should copy node module scripts when bundling is disabled', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });
			const bundleScriptSpy = vi.spyOn(
				processor as unknown as { bundleScript: (options: Record<string, unknown>) => Promise<string> },
				'bundleScript',
			);
			const ensureDirSpy = vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => undefined);
			const copyFileSpy = vi.spyOn(fileSystem, 'copyFile').mockImplementation(() => undefined);
			fileSystem.exists = vi.fn(
				(candidatePath: string) =>
					candidatePath !== '/test/project/.eco/public/assets/vendors/nm-install-hydrator',
			);

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: '@ecopages/radiant/client/install-hydrator',
				inline: false,
				bundle: false,
			};

			const result = await processor.process(dep);

			expect(bundleScriptSpy).not.toHaveBeenCalled();
			expect(ensureDirSpy).toHaveBeenCalledWith('/test/project/.eco/public/assets/vendors');
			expect(copyFileSpy).toHaveBeenCalledWith(
				'/test/project/node_modules/@ecopages/radiant/client/install-hydrator',
				'/test/project/.eco/public/assets/vendors/nm-install-hydrator',
			);
			expect(result.inline).toBe(false);
			expect(result.filepath).toBe('/test/project/.eco/public/assets/vendors/nm-install-hydrator');
		});
	});

	describe('resolveModulePath with real dependencies', () => {
		beforeEach(() => {
			fileSystem.exists = originalExists;
			fileSystem.readFileAsBuffer = originalReadFileAsBuffer;
		});

		test('should resolve @ecopages/logger from node_modules', async () => {
			const config = createMockConfig();
			config.rootDir = process.cwd();
			const processor = new NodeModuleScriptProcessor({ appConfig: config });
			fileSystem.readFileAsBuffer = vi.fn().mockResolvedValue(Buffer.from('dummy content'));

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: '@ecopages/logger',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result).toBeDefined();
			expect(result.inline).toBe(true);
			expect(result.content).toBeDefined();
			expect(result.content!.length).toBeGreaterThan(0);
		});

		test('should resolve exported package subpaths when adapter resolution falls back', async () => {
			const config = createMockConfig();
			config.rootDir = path.resolve(import.meta.dirname, '../../../../../../../../apps/docs');
			const processor = new NodeModuleScriptProcessor({ appConfig: config });
			fileSystem.readFileAsBuffer = vi.fn().mockReturnValue(Buffer.from('hydrator bootstrap'));

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: '@ecopages/radiant/client/install-hydrator',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.inline).toBe(true);
			expect(result.content).toBe('hydrator bootstrap');
		});
	});
});
