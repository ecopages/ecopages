import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';
import { AssetProcessingService } from './asset-processing.service';
import type { AssetDefinition } from './assets.types';

const mockConfig = {
	absolutePaths: {
		distDir: '/test/dist',
	},
} as any;

const mockProcessor = {
	process: async () => ({
		filepath: '/test/dist/assets/test.js',
		kind: 'script',
		inline: false,
	}),
};

const originalEnsureDirectoryExists = fileSystem.ensureDir;
const originalGzipDir = fileSystem.gzipDir;
const originalWrite = fileSystem.write;
const originalReadFileSync = fileSystem.readFileSync;
const originalRemove = fileSystem.remove;
const originalExists = fileSystem.exists;

beforeEach(() => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.write = mock(() => {});
	fileSystem.readFileSync = mock(() => Buffer.from('') as any);
	fileSystem.remove = mock(() => {});
	fileSystem.exists = mock(() => false);
});

afterEach(() => {
	fileSystem.ensureDir = originalEnsureDirectoryExists;
	fileSystem.gzipDir = originalGzipDir;
	fileSystem.write = originalWrite;
	fileSystem.readFileSync = originalReadFileSync;
	fileSystem.remove = originalRemove;
	fileSystem.exists = originalExists;
	mock.restore();
});

test('AssetProcessingService - registerProcessor', () => {
	const service = new AssetProcessingService(mockConfig);
	service.registerProcessor('script', 'file', mockProcessor);
	expect(service.getRegistry().getProcessor('script', 'file')).toBeDefined();
});

test('AssetProcessingService - processDependencies', async () => {
	const service = AssetProcessingService.createWithDefaultProcessors(mockConfig);
	const results = await service.processDependencies(
		[
			{
				kind: 'script',
				source: 'content',
				content: 'console.log("test")',
				bundle: false,
			} as AssetDefinition,
		],
		'test-key',
	);

	expect(results.length).toBe(1);
	expect((results[0] as any).key).toBe('test-key');
});

test('AssetProcessingService - createWithDefaultProcessors', () => {
	const service = AssetProcessingService.createWithDefaultProcessors(mockConfig);
	expect([...service.getRegistry().getAllProcessors().values()].length).toBeGreaterThan(0);
});

test('AssetProcessingService - processDependencies - success', async () => {
	const ensureDirMock = mock(() => {});
	const gzipDirMock = mock(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const mockProcessor1 = {
		process: mock(async () => ({
			filepath: '/test/dist/assets/script.js',
			kind: 'script',
			inline: false,
		})),
	};
	const mockProcessor2 = {
		process: mock(async () => ({
			filepath: '/test/dist/assets/style.css',
			kind: 'stylesheet',
			inline: false,
		})),
	};
	service.registerProcessor('script', 'file', mockProcessor1);
	service.registerProcessor('stylesheet', 'file', mockProcessor2);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script', source: 'file', filepath: 'path/to/script.js' },
		{ kind: 'stylesheet', source: 'file', filepath: 'path/to/style.css' },
	];
	const key = 'test-page';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(mockProcessor1.process).toHaveBeenCalledTimes(1);
	expect(mockProcessor2.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(2);

	expect(results[0]).toEqual(
		expect.objectContaining({
			filepath: '/test/dist/assets/script.js',
			kind: 'script',
			inline: false,
			srcUrl: '/assets/script.js',
		}),
	);
	expect(results[1]).toEqual(
		expect.objectContaining({
			filepath: '/test/dist/assets/style.css',
			kind: 'stylesheet',
			inline: false,
			srcUrl: '/assets/style.css',
		}),
	);

	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - processor not found', async () => {
	const ensureDirMock = mock(() => {});
	const gzipDirMock = mock(() => {});

	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(mockConfig);

	const dependencies: AssetDefinition[] = [{ kind: 'script', source: 'content', content: 'alert(1)' }];
	const key = 'test-key-missing';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(results.length).toBe(0);
	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - error during processing', async () => {
	const ensureDirMock = mock(() => {});
	const gzipDirMock = mock(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const erroringProcessor = {
		process: mock(async () => {
			throw new Error('Processing failed!');
		}),
	};
	service.registerProcessor('script', 'file', erroringProcessor);

	const dependency: AssetDefinition = {
		kind: 'script',
		source: 'file',
		filepath: 'path/to/failing.js',
	};
	const key = 'test-key-error';

	const results = await service.processDependencies([dependency], key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(erroringProcessor.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(0);
	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - handles undefined filepath for srcUrl', async () => {
	const ensureDirMock = mock(() => {});
	const gzipDirMock = mock(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(mockConfig);
	const mockProcessorInline = {
		process: mock(async () => ({
			kind: 'script',
			inline: true,
			content: 'console.log("inline");',
		})),
	};
	service.registerProcessor('script', 'content', mockProcessorInline);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script', source: 'content', content: 'console.log("inline");', inline: true },
	];
	const key = 'test-inline';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(mockProcessorInline.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);

	expect(results[0]).toEqual(
		expect.objectContaining({
			kind: 'script',
			inline: true,
			content: 'console.log("inline");',
			srcUrl: undefined,
		}),
	);

	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - caching returns cached asset without reprocessing', async () => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const processMock = mock(async () => ({
		filepath: '/test/dist/assets/cached.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/cached.js' };

	const results1 = await service.processDependencies([dependency], 'key1');
	const results2 = await service.processDependencies([dependency], 'key2');

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(results1.length).toBe(1);
	expect(results2.length).toBe(1);
	expect(results1[0].srcUrl).toBe('/assets/cached.js');
	expect(results2[0].srcUrl).toBe('/assets/cached.js');
});

test('AssetProcessingService - deduplication processes duplicate deps only once', async () => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const processMock = mock(async () => ({
		filepath: '/test/dist/assets/dedup.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/dedup.js' };
	const duplicateDeps = [dependency, dependency, dependency];

	const results = await service.processDependencies(duplicateDeps, 'dedup-key');

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);
});

test('AssetProcessingService - clearCache clears all cached assets', async () => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const processMock = mock(async () => ({
		filepath: '/test/dist/assets/clear.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/clear.js' };

	await service.processDependencies([dependency], 'key1');
	expect(processMock).toHaveBeenCalledTimes(1);

	service.clearCache();

	await service.processDependencies([dependency], 'key2');
	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - invalidateCacheForFile removes specific file from cache', async () => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.exists = mock(() => true);

	const service = new AssetProcessingService(mockConfig);
	const processMock = mock(async () => ({
		filepath: '/test/dist/assets/invalidate.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/invalidate.js' };

	await service.processDependencies([dependency], 'key1');
	expect(processMock).toHaveBeenCalledTimes(1);

	service.invalidateCacheForFile('/test/dist/assets/invalidate.js');

	await service.processDependencies([dependency], 'key2');
	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - skips missing file dependencies', async () => {
	fileSystem.ensureDir = mock(() => {});
	fileSystem.gzipDir = mock(() => {});
	fileSystem.exists = mock(() => false);

	const service = new AssetProcessingService(mockConfig);
	const processMock = mock(async () => ({
		filepath: '/test/dist/assets/missing.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/missing.js' };

	const results = await service.processDependencies([dependency], 'missing-key');

	expect(processMock).not.toHaveBeenCalled();
	expect(results.length).toBe(0);
});
