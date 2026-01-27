import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';
import { NodeModuleScriptProcessor } from './node-module-script.processor';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import type { NodeModuleScriptAsset } from '../../assets.types';

const originalExists = fileSystem.exists;
const originalReadFileAsBuffer = fileSystem.readFileAsBuffer;

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

describe('NodeModuleScriptProcessor', () => {
	let existsMock: ReturnType<typeof mock>;
	let readFileAsBufferMock: ReturnType<typeof mock>;

	beforeEach(() => {
		existsMock = mock(() => true);
		readFileAsBufferMock = mock(() => Buffer.from('// module content'));
		fileSystem.exists = existsMock;
		fileSystem.readFileAsBuffer = readFileAsBufferMock;
	});

	afterEach(() => {
		fileSystem.exists = originalExists;
		fileSystem.readFileAsBuffer = originalReadFileAsBuffer;
		mock.restore();
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

	describe('process - caching', () => {
		test('should return cached result on subsequent calls', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'cached-package/dist/index.js',
				inline: true,
			};

			const result1 = await processor.process(dep);
			const result2 = await processor.process(dep);

			expect(readFileAsBufferMock.mock.calls.length).toBe(1);
			expect(result1).toEqual(result2);
		});
	});

	describe('resolveModulePath', () => {
		test('should throw error when module not found', async () => {
			existsMock = mock(() => false);
			fileSystem.exists = existsMock;

			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'non-existent-package/index.js',
				inline: true,
			};

			expect(processor.process(dep)).rejects.toThrow(/Could not resolve module/);
		});

		test('should find module in parent directories', async () => {
			let callCount = 0;
			existsMock = mock((_path: string) => {
				callCount++;
				return callCount >= 3;
			});
			fileSystem.exists = existsMock;

			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'parent-package/index.js',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result).toBeDefined();
			expect(callCount).toBeGreaterThanOrEqual(3);
		});
	});

	describe('process - custom name', () => {
		test('should use custom name when provided', async () => {
			const processor = new NodeModuleScriptProcessor({ appConfig: createMockConfig() });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: 'some-package/dist/index.js',
				name: 'custom-vendor',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result).toBeDefined();
			expect(result.inline).toBe(true);
		});
	});

	describe('resolveModulePath with real dependencies', () => {
		beforeEach(() => {
			fileSystem.exists = originalExists;
			fileSystem.readFileAsBuffer = originalReadFileAsBuffer;
		});

		test('should resolve @ecopages/radiant using Bun.resolveSync', async () => {
			const config = createMockConfig();
			config.rootDir = process.cwd();
			const processor = new NodeModuleScriptProcessor({ appConfig: config });

			const dep: NodeModuleScriptAsset = {
				kind: 'script',
				source: 'node-module',
				importPath: '@ecopages/radiant',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result).toBeDefined();
			expect(result.inline).toBe(true);
			expect(result.content).toBeDefined();
			expect(result.content!.length).toBeGreaterThan(0);
		});
	});
});
