import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';
import { FileScriptProcessor } from './file-script.processor';
import type { EcoPagesAppConfig, IHmrManager } from '../../../../internal-types';
import type { FileScriptAsset } from '../../assets.types';

const originalReadFileSync = fileSystem.readFileSync;
const originalCopyFile = fileSystem.copyFile;
const originalExists = fileSystem.exists;

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
	let readFileSyncMock: ReturnType<typeof mock>;
	let copyFileMock: ReturnType<typeof mock>;
	let existsMock: ReturnType<typeof mock>;

	beforeEach(() => {
		readFileSyncMock = mock(() => 'console.log("test");');
		copyFileMock = mock(() => {});
		existsMock = mock(() => false);
		fileSystem.readFileSync = readFileSyncMock;
		fileSystem.copyFile = copyFileMock;
		fileSystem.exists = existsMock;
	});

	afterEach(() => {
		fileSystem.readFileSync = originalReadFileSync;
		fileSystem.copyFile = originalCopyFile;
		fileSystem.exists = originalExists;
		mock.restore();
	});

	describe('setHmrManager', () => {
		test('should accept an HMR manager', () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const mockHmrManager = {
				isEnabled: () => true,
				registerEntrypoint: async () => '/hmr/script.js',
			} as unknown as IHmrManager;

			expect(() => processor.setHmrManager(mockHmrManager)).not.toThrow();
		});
	});

	describe('process', () => {
		test('should delegate to HMR manager when enabled and not inline', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const mockHmrManager = {
				isEnabled: () => true,
				registerEntrypoint: mock(async () => '/hmr/script.js'),
			} as unknown as IHmrManager;
			processor.setHmrManager(mockHmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: false,
			};

			const result = await processor.process(dep);

			expect(mockHmrManager.registerEntrypoint).toHaveBeenCalledWith('/test/project/src/script.ts');
			expect(result.srcUrl).toBe('/hmr/script.js');
			expect(result.inline).toBe(false);
		});

		test('should not use HMR when inline is true', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });
			const mockHmrManager = {
				isEnabled: () => true,
				registerEntrypoint: mock(async () => '/hmr/script.js'),
			} as unknown as IHmrManager;
			processor.setHmrManager(mockHmrManager);

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/script.ts',
				inline: true,
				bundle: false,
			};

			const result = await processor.process(dep);

			expect(mockHmrManager.registerEntrypoint).not.toHaveBeenCalled();
			expect(result.inline).toBe(true);
			expect(result.content).toBeDefined();
		});

		test('should copy file without bundling when bundle is false', async () => {
			const processor = new FileScriptProcessor({ appConfig: createMockConfig() });

			const dep: FileScriptAsset = {
				kind: 'script',
				source: 'file',
				filepath: '/test/project/src/scripts/app.js',
				bundle: false,
				inline: false,
			};

			const result = await processor.process(dep);

			expect(copyFileMock).toHaveBeenCalled();
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
});
