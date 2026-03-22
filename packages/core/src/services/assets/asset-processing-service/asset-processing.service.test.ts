import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { AssetProcessingService } from './asset-processing.service';
import type { AssetDefinition } from './assets.types';

const Config = {
	absolutePaths: {
		distDir: '/test/dist',
	},
} as any;

const Processor = {
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
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.write = vi.fn(() => {});
	fileSystem.readFileSync = vi.fn(() => Buffer.from('') as any);
	fileSystem.remove = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => false);
});

afterEach(() => {
	fileSystem.ensureDir = originalEnsureDirectoryExists;
	fileSystem.gzipDir = originalGzipDir;
	fileSystem.write = originalWrite;
	fileSystem.readFileSync = originalReadFileSync;
	fileSystem.remove = originalRemove;
	fileSystem.exists = originalExists;
	vi.restoreAllMocks();
});

test('AssetProcessingService - registerProcessor', () => {
	const service = new AssetProcessingService(Config);
	service.registerProcessor('script', 'file', Processor);
	expect(service.getRegistry().getProcessor('script', 'file')).toBeDefined();
});

test('AssetProcessingService - processDependencies', async () => {
	const service = AssetProcessingService.createWithDefaultProcessors(Config);
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
	const service = AssetProcessingService.createWithDefaultProcessors(Config);
	expect([...service.getRegistry().getAllProcessors().values()].length).toBeGreaterThan(0);
});

test('AssetProcessingService - processDependencies - success', async () => {
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const Processor1 = {
		process: vi.fn(async () => ({
			filepath: '/test/dist/assets/script.js',
			kind: 'script',
			inline: false,
		})),
	};
	const Processor2 = {
		process: vi.fn(async () => ({
			filepath: '/test/dist/assets/style.css',
			kind: 'stylesheet',
			inline: false,
		})),
	};
	service.registerProcessor('script', 'file', Processor1);
	service.registerProcessor('stylesheet', 'file', Processor2);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script', source: 'file', filepath: 'path/to/script.js' },
		{ kind: 'stylesheet', source: 'file', filepath: 'path/to/style.css' },
	];
	const key = 'test-page';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(Processor1.process).toHaveBeenCalledTimes(1);
	expect(Processor2.process).toHaveBeenCalledTimes(1);
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
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});

	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(Config);

	const dependencies: AssetDefinition[] = [{ kind: 'script', source: 'content', content: 'alert(1)' }];
	const key = 'test-key-missing';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(results.length).toBe(0);
	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - error during processing', async () => {
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const erroringProcessor = {
		process: vi.fn(async () => {
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
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(Config);
	const ProcessorInline = {
		process: vi.fn(async () => ({
			kind: 'script',
			inline: true,
			content: 'console.log("inline");',
		})),
	};
	service.registerProcessor('script', 'content', ProcessorInline);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script', source: 'content', content: 'console.log("inline");', inline: true },
	];
	const key = 'test-inline';

	const results = await service.processDependencies(dependencies, key);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/assets');
	expect(ProcessorInline.process).toHaveBeenCalledTimes(1);
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

test('AssetProcessingService - processDependencies - normalizes absolute srcUrl to public assets path', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processor = {
		process: vi.fn(async () => ({
			srcUrl: '/test/dist/assets/scripts/module--tanstack-react-table.js',
			kind: 'script',
			inline: false,
		})),
	};
	service.registerProcessor('script', 'file', processor);

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/module.js' };

	const results = await service.processDependencies([dependency], 'normalize-src-url-key');

	expect(processor.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);
	expect(results[0].srcUrl).toBe('/assets/scripts/module--tanstack-react-table.js');
});

test('AssetProcessingService - caching returns cached asset without reprocessing', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
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

test('AssetProcessingService - stale cached emitted files are rebuilt when output is missing', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	const existsMock = vi
		.fn()
		.mockImplementationOnce(() => true)
		.mockImplementationOnce(() => false)
		.mockImplementation(() => true);
	fileSystem.exists = existsMock;

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/assets/stale.js',
		kind: 'script',
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script', source: 'file', filepath: 'path/to/stale.js' };

	await service.processDependencies([dependency], 'key1');
	await service.processDependencies([dependency], 'key2');

	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - deduplication processes duplicate deps only once', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
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
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
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
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
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
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => false);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
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
