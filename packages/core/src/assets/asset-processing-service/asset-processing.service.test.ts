import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { AssetProcessingService } from './asset-processing.service';
import type { AssetDefinition, ContentScriptAsset, ProcessedAsset } from './assets.types';
import { PageCacheService } from '../../page-cache/page-cache-service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { BuildInputDependencyIndex } from '../../build/cache/build-input-dependency-index.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { ProcessedAssetLedger } from './processed-asset-ledger.ts';
import type { AppRuntime } from '../../config/assembly/app-runtime.ts';

function createTestConfig(overrides: Record<string, unknown> = {}): EcoPagesAppConfig {
	return {
		rootDir: '/test',
		absolutePaths: {
			distDir: '/test/dist/client',
		},
		appRuntime: {
			buildInputIndex: new BuildInputDependencyIndex(),
			processedAssets: new ProcessedAssetLedger('/test'),
		} as AppRuntime,
		...overrides,
	} as unknown as EcoPagesAppConfig;
}

const Config = createTestConfig() as any;

const Processor = {
	process: async () => ({
		filepath: '/test/dist/client/assets/test.js',
		kind: 'script' as const,
		inline: false,
	}),
};

const originalEnsureDirectoryExists = fileSystem.ensureDir;
const originalGzipDir = fileSystem.gzipDir;
const originalGzipFile = fileSystem.gzipFile;
const originalWrite = fileSystem.write;
const originalReadFileSync = fileSystem.readFileSync;
const originalRemove = fileSystem.remove;
const originalExists = fileSystem.exists;
const originalHash = fileSystem.hash;

beforeEach(() => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.gzipFile = vi.fn(() => {});
	fileSystem.write = vi.fn(() => {});
	fileSystem.readFileSync = vi.fn(() => Buffer.from('') as any);
	fileSystem.remove = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => false);
	fileSystem.hash = vi.fn(() => 'test-hash');
	Config.appRuntime = {
		buildInputIndex: new BuildInputDependencyIndex(),
		processedAssets: new ProcessedAssetLedger('/test'),
	} as AppRuntime;
});

afterEach(() => {
	fileSystem.ensureDir = originalEnsureDirectoryExists;
	fileSystem.gzipDir = originalGzipDir;
	fileSystem.gzipFile = originalGzipFile;
	fileSystem.write = originalWrite;
	fileSystem.readFileSync = originalReadFileSync;
	fileSystem.remove = originalRemove;
	fileSystem.exists = originalExists;
	fileSystem.hash = originalHash;
	vi.restoreAllMocks();
});

test('AssetProcessingService - registerProcessor', async () => {
	fileSystem.exists = vi.fn(() => true);
	const service = new AssetProcessingService(Config);
	const process = vi.fn(Processor.process);
	service.registerProcessor('script', 'file', { process });

	const results = await service.processDependencies(
		[{ kind: 'script' as const, source: 'file', filepath: 'path/to/registered.js' }],
		undefined,
	);

	expect(results.map((asset) => asset.filepath)).toEqual(['/test/dist/client/assets/test.js']);
	expect(process).toHaveBeenCalledTimes(1);
});

test('AssetProcessingService - processDependencies', async () => {
	const service = AssetProcessingService.createWithDefaultProcessors(Config);
	const outputFilepath = path.join(Config.absolutePaths.distDir, 'assets', 'scripts', 'page-entry.js');
	const results = await service.processDependencies(
		[
			{
				kind: 'script' as const,
				source: 'content',
				content: 'console.log("test")',
				name: 'page-entry',
				bundle: false,
			} as AssetDefinition,
		],
		undefined,
	);

	expect(results).toHaveLength(1);
	expect(results[0]).toMatchObject({
		kind: 'script',
		filepath: outputFilepath,
		srcUrl: '/assets/scripts/page-entry.js',
	});
	expect(fileSystem.write).toHaveBeenCalledWith(outputFilepath, 'console.log("test")');
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
			filepath: '/test/dist/client/assets/script.js',
			kind: 'script' as const,
			inline: false,
		})),
	};
	const Processor2 = {
		process: vi.fn(async () => ({
			filepath: '/test/dist/client/assets/style.css',
			kind: 'stylesheet' as const,
			inline: false,
		})),
	};
	service.registerProcessor('script', 'file', Processor1);
	service.registerProcessor('stylesheet', 'file', Processor2);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script' as const, source: 'file', filepath: 'path/to/script.js' },
		{ kind: 'stylesheet' as const, source: 'file', filepath: 'path/to/style.css' },
	];
	const results = await service.processDependencies(dependencies, undefined);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/client/assets');
	expect(Processor1.process).toHaveBeenCalledTimes(1);
	expect(Processor2.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(2);

	expect(results[0]).toEqual(
		expect.objectContaining({
			filepath: '/test/dist/client/assets/script.js',
			kind: 'script' as const,
			inline: false,
			srcUrl: '/assets/script.js',
		}),
	);
	expect(results[1]).toEqual(
		expect.objectContaining({
			filepath: '/test/dist/client/assets/style.css',
			kind: 'stylesheet' as const,
			inline: false,
			srcUrl: '/assets/style.css',
		}),
	);

	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - returns the app-wide build output the ledger records for a script', async () => {
	fileSystem.exists = vi.fn(() => true);
	const prebuiltScript: AssetDefinition = { kind: 'script', source: 'file', filepath: '/app/src/counter.script.ts' };
	const prebuiltAsset: ProcessedAsset = {
		kind: 'script',
		filepath: path.resolve('/test/dist/client/assets/client-shared.js'),
		srcUrl: '/assets/client-shared.js',
		inline: false,
	};
	const appConfig = createTestConfig();
	const ledger = requireAppRuntime(appConfig).processedAssets;
	ledger.record(prebuiltScript, prebuiltAsset);
	ledger.recordBrowserOutputs([prebuiltAsset.filepath ?? '']);
	const service = new AssetProcessingService(appConfig);
	const scriptProcessor = { process: vi.fn(Processor.process) };
	service.registerProcessor('script', 'file', scriptProcessor);

	const results = await service.processDependencies(
		[prebuiltScript, { kind: 'script', source: 'file', filepath: '/app/src/other.script.ts' }],
		undefined,
	);

	expect(scriptProcessor.process).toHaveBeenCalledTimes(1);
	expect(results).toContainEqual(prebuiltAsset);
	expect(results).toHaveLength(2);
});

test('AssetProcessingService - processDependencies - processor not found', async () => {
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});

	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(Config);

	const dependencies: AssetDefinition[] = [{ kind: 'script' as const, source: 'content', content: 'alert(1)' }];
	const results = await service.processDependencies(dependencies, undefined);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/client/assets');
	expect(results.length).toBe(0);
	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - rejects when a processor fails', async () => {
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
		kind: 'script' as const,
		source: 'file',
		filepath: 'path/to/failing.js',
	};
	await expect(service.processDependencies([dependency], undefined)).rejects.toThrow('Processing failed!');

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/client/assets');
	expect(erroringProcessor.process).toHaveBeenCalledTimes(1);
	expect(gzipDirMock).not.toHaveBeenCalled();
});

test('AssetProcessingService - processDependencies - rejects when a grouped bundle fails', async () => {
	fileSystem.exists = vi.fn(() => true);
	const service = new AssetProcessingService(Config);
	service.registerProcessor('script', 'file', {
		process: vi.fn(async () => Processor.process()),
		processGrouped: vi.fn(async () => {
			throw new Error('[browser-build] server-only module "secret.server.ts"');
		}),
	});

	const dependencies = ['a', 'b'].map((name) => ({
		kind: 'script' as const,
		source: 'file' as const,
		filepath: `/app/src/${name}.script.ts`,
		groupedBundle: { id: 'page', entryName: name },
	})) as AssetDefinition[];

	await expect(service.processDependencies(dependencies, undefined)).rejects.toThrow('server-only module');
});

test('AssetProcessingService - processDependencies - handles undefined filepath for srcUrl', async () => {
	const ensureDirMock = vi.fn(() => {});
	const gzipDirMock = vi.fn(() => {});
	fileSystem.ensureDir = ensureDirMock;
	fileSystem.gzipDir = gzipDirMock;

	const service = new AssetProcessingService(Config);
	const ProcessorInline = {
		process: vi.fn(async () => ({
			kind: 'script' as const,
			inline: true,
			content: 'console.log("inline");',
		})),
	};
	service.registerProcessor('script', 'content', ProcessorInline);

	const dependencies: AssetDefinition[] = [
		{ kind: 'script' as const, source: 'content', content: 'console.log("inline");', inline: true },
	];
	const results = await service.processDependencies(dependencies, undefined);

	expect(ensureDirMock).toHaveBeenCalledWith('/test/dist/client/assets');
	expect(ProcessorInline.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);

	expect(results[0]).toEqual(
		expect.objectContaining({
			kind: 'script' as const,
			inline: true,
			content: 'console.log("inline");',
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
			srcUrl: '/test/dist/client/assets/scripts/module--tanstack-react-table.js',
			kind: 'script' as const,
			inline: false,
		})),
	};
	service.registerProcessor('script', 'file', processor);

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/module.js' };

	const results = await service.processDependencies([dependency], undefined);

	expect(processor.process).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);
	expect(results[0].srcUrl).toBe('/assets/scripts/module--tanstack-react-table.js');
});

test('AssetProcessingService - processDependencies - does not map a path beside the dist directory to a public URL', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	service.registerProcessor('script', 'file', {
		process: vi.fn(async () => ({ filepath: '/test/dist-old/x.js', kind: 'script' as const, inline: false })),
	});

	const results = await service.processDependencies(
		[{ kind: 'script' as const, source: 'file', filepath: 'path/to/x.js' }],
		undefined,
	);

	expect(results[0].srcUrl).toBeUndefined();
});

test('AssetProcessingService - caching returns cached asset without reprocessing', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/cached.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/cached.js' };

	const results1 = await service.processDependencies([dependency], undefined);
	const results2 = await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(results1.length).toBe(1);
	expect(results2.length).toBe(1);
	expect(results1[0].srcUrl).toBe('/assets/cached.js');
	expect(results2[0].srcUrl).toBe('/assets/cached.js');
});

test('AssetProcessingService - owns the cache for node module assets', async () => {
	fileSystem.exists = vi.fn(() => true);
	const readFileAsBuffer = vi.spyOn(fileSystem, 'readFileAsBuffer').mockReturnValue(Buffer.from('module code'));
	const service = AssetProcessingService.createWithDefaultProcessors(Config);
	const dependency: AssetDefinition = {
		kind: 'script',
		source: 'node-module',
		importPath: '/test/project/node_modules/cached-package/index.js',
		inline: true,
	};

	const first = await service.processDependencies([dependency], undefined);
	const second = await service.processDependencies([dependency], undefined);

	expect(readFileAsBuffer).toHaveBeenCalledTimes(1);
	expect(first).toEqual(second);
});

test('AssetProcessingService - invalidates a cached node module when its source changes', async () => {
	fileSystem.exists = vi.fn(() => true);
	let moduleContent = 'module version one';
	const readFileAsBuffer = vi
		.spyOn(fileSystem, 'readFileAsBuffer')
		.mockImplementation(() => Buffer.from(moduleContent));
	const appConfig = createTestConfig();
	const service = AssetProcessingService.createWithDefaultProcessors(appConfig);
	const modulePath = '/test/project/node_modules/changed-package/index.js';
	const dependency: AssetDefinition = {
		kind: 'script',
		source: 'node-module',
		importPath: modulePath,
		inline: true,
	};

	const [first] = await service.processDependencies([dependency], undefined);
	moduleContent = 'module version two';
	requireAppRuntime(appConfig).buildInputIndex.recordChanges([modulePath]);
	const [second] = await service.processDependencies([dependency], undefined);

	expect(readFileAsBuffer).toHaveBeenCalledTimes(2);
	expect(first?.content).toBe('module version one');
	expect(second?.content).toBe('module version two');
});

test('AssetProcessingService - rebuilds a cached bundle when one of its bundled inputs changes', async () => {
	fileSystem.exists = vi.fn(() => true);
	fileSystem.hash = vi.fn(() => 'entry-v1');
	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/entry.js',
		kind: 'script' as const,
		inline: false,
		bundledSourceFilepaths: ['/test/src/helper.ts'],
	}));
	service.registerProcessor('script', 'file', { process: processMock });
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/entry.ts' };

	await service.processDependencies([dependency], undefined);
	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/src/helper.ts']);
	await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - keeps a cached bundle without re-reading its inputs when an unrelated file changes', async () => {
	fileSystem.exists = vi.fn(() => true);
	fileSystem.hash = vi.fn(() => 'entry-v1');
	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/entry.js',
		kind: 'script' as const,
		inline: false,
		bundledSourceFilepaths: ['/test/src/helper.ts'],
	}));
	service.registerProcessor('script', 'file', { process: processMock });
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/entry.ts' };

	await service.processDependencies([dependency], undefined);
	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/src/other.ts']);
	await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(fileSystem.hash).not.toHaveBeenCalledWith('/test/src/helper.ts');
});

test('AssetProcessingService - reuses file stylesheets until their source changes', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);
	let sourceHash = 'style-v1';
	fileSystem.hash = vi.fn(() => sourceHash);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/docs.css',
		kind: 'stylesheet' as const,
		inline: false,
	}));
	service.registerProcessor('stylesheet', 'file', { process: processMock });

	const dependency: AssetDefinition = {
		kind: 'stylesheet' as const,
		source: 'file',
		filepath: 'path/to/docs.css',
	};

	await service.processDependencies([dependency], undefined);
	await service.processDependencies([dependency], undefined);
	sourceHash = 'style-v2';
	await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - stale cached emitted files are rebuilt when output is missing', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	let emittedFileExists = true;
	fileSystem.exists = vi.fn((filepath: string) => {
		if (filepath === 'path/to/stale.js') {
			return true;
		}

		return emittedFileExists;
	});

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/stale.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/stale.js' };

	await service.processDependencies([dependency], undefined);
	emittedFileExists = false;
	await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - deduplication processes duplicate deps only once', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/dedup.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/dedup.js' };
	const duplicateDeps = [dependency, dependency, dependency];

	const results = await service.processDependencies(duplicateDeps, undefined);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(results.length).toBe(1);
});

test('AssetProcessingService - deduplication preserves package role distinctions', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async (dep: AssetDefinition) => ({
		filepath: `/test/dist/client/assets/${dep.packageRole ?? 'default'}.js`,
		kind: 'script' as const,
		inline: false,
		packageRole: dep.packageRole,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const pageDependency: AssetDefinition = {
		kind: 'script' as const,
		source: 'file',
		filepath: 'path/to/dedup-role.js',
		packageRole: 'page-script' as const,
	};
	const separateDependency: AssetDefinition = {
		...pageDependency,
		packageRole: 'keep-separate' as const,
	};

	const results = await service.processDependencies([pageDependency, separateDependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(2);
	expect(results).toHaveLength(2);
	expect(results.map((result) => result.packageRole)).toEqual(['page-script', 'keep-separate']);
});

test('AssetProcessingService - integration prepareAssetDependencies runs before grouped processing', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const prepareAssetDependencies = vi.fn((dependencies: AssetDefinition[]) => {
		const moduleScript = dependencies.find(
			(dep) => dep.kind === 'script' && dep.source === 'content' && 'name' in dep && dep.name === 'module-images',
		);
		if (moduleScript && moduleScript.kind === 'script' && moduleScript.source === 'content') {
			moduleScript.groupedBundle = {
				id: 'ecopages-ecopages-jsx-page-content-scripts',
				entryName: 'module-images',
			};
		}
		return dependencies;
	});

	const integration = { name: 'ecopages-jsx', prepareAssetDependencies };
	const service = new AssetProcessingService({ ...Config, integrations: [integration] });
	const processGroupedMock = vi.fn(
		async (
			deps: {
				name?: string;
				excludeFromHtml?: boolean;
				groupedBundle?: { id: string; entryName: string };
			}[],
		) =>
			deps.map((dep) => ({
				filepath: `/test/dist/client/assets/${dep.name ?? 'grouped'}.js`,
				kind: 'script' as const,
				inline: false,
				groupedBundle: dep.groupedBundle,
				...(dep.excludeFromHtml ? { excludeFromHtml: true } : {}),
			})),
	);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/standalone.js',
		kind: 'script' as const,
		inline: false,
	}));

	service.registerProcessor('script', 'content', {
		process: processMock,
		processGrouped: processGroupedMock,
	});
	service.registerProcessor('script', 'file', { process: processMock });

	const results = await service.processDependencies(
		[
			{
				kind: 'script' as const,
				source: 'content',
				content: 'import "ecopages:images";',
				name: 'module-images',
			},
			{
				kind: 'script' as const,
				source: 'content',
				content: 'import "/lazy.ts";',
				name: 'lazy-entry',
				excludeFromHtml: true,
				bundleOptions: { splitting: false },
			},
			{
				kind: 'script' as const,
				source: 'file',
				filepath: '/theme-toggle.script.ts',
				packageRole: 'dynamic-chunk' as const,
			},
		],
		integration,
	);

	expect(prepareAssetDependencies).toHaveBeenCalledTimes(1);
	expect(processGroupedMock).toHaveBeenCalledTimes(1);
	expect(processGroupedMock).toHaveBeenCalledWith([expect.objectContaining({ name: 'module-images' })]);
	expect(processMock).toHaveBeenCalledTimes(2);
	expect(results).toHaveLength(3);
});

test('AssetProcessingService - grouped content scripts use processGrouped once per bundle id', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processGroupedMock = vi.fn(
		async (
			deps: {
				groupedBundle?: { id: string; entryName: string };
				excludeFromHtml?: boolean;
				packageRole?: ProcessedAsset['packageRole'];
			}[],
		) =>
			deps.map((dep) => ({
				filepath: `/test/dist/client/assets/${dep.groupedBundle?.entryName ?? 'entry'}.js`,
				kind: 'script' as const,
				inline: false,
				groupedBundle: dep.groupedBundle,
				...(dep.packageRole ? { packageRole: dep.packageRole } : {}),
				...(dep.excludeFromHtml ? { excludeFromHtml: true } : {}),
			})),
	);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/standalone.js',
		kind: 'script' as const,
		inline: false,
	}));

	service.registerProcessor('script', 'content', {
		process: processMock,
		processGrouped: processGroupedMock,
	});

	const results = await service.processDependencies(
		[
			{
				kind: 'script' as const,
				source: 'content',
				content: 'import "/page.js";',
				groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
				packageRole: 'page-script' as const,
			},
			{
				kind: 'script' as const,
				source: 'content',
				content: 'import "/lazy.js";',
				groupedBundle: { id: 'bundle-1', entryName: 'lazy-entry' },
				excludeFromHtml: true,
			},
		],
		undefined,
	);

	expect(processGroupedMock).toHaveBeenCalledTimes(1);
	expect(processMock).not.toHaveBeenCalled();
	expect(results.map((result) => result.srcUrl)).toEqual(['/assets/page-entry.js', '/assets/lazy-entry.js']);
});

test('AssetProcessingService - matches grouped processor outputs by entry name', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processGroupedMock = vi.fn(async (dependencies: ContentScriptAsset[]): Promise<ProcessedAsset[]> =>
		dependencies
			.slice()
			.reverse()
			.map((dependency) => ({
				filepath: `/test/dist/client/assets/${dependency.groupedBundle?.entryName}.js`,
				kind: 'script',
				inline: false,
				groupedBundle: dependency.groupedBundle,
			})),
	);
	service.registerProcessor('script', 'content', {
		process: vi.fn(async (): Promise<ProcessedAsset> => ({ kind: 'script', inline: false })),
		processGrouped: processGroupedMock,
	});

	const results = await service.processDependencies(
		[
			{
				kind: 'script',
				source: 'content',
				content: 'import "/page.js";',
				groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
			},
			{
				kind: 'script',
				source: 'content',
				content: 'import "/lazy.js";',
				groupedBundle: { id: 'bundle-1', entryName: 'lazy-entry' },
			},
		],
		undefined,
	);

	expect(results.map((asset) => asset.filepath)).toEqual([
		'/test/dist/client/assets/page-entry.js',
		'/test/dist/client/assets/lazy-entry.js',
	]);
});

test('AssetProcessingService - does not cache an incomplete grouped processor result', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processGroupedMock = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			filepath: '/test/dist/client/assets/page-entry.js',
			kind: 'script',
			inline: false,
			groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
		},
	]);
	service.registerProcessor('script', 'content', {
		process: vi.fn(async (): Promise<ProcessedAsset> => ({ kind: 'script', inline: false })),
		processGrouped: processGroupedMock,
	});
	const dependencies: ContentScriptAsset[] = [
		{
			kind: 'script',
			source: 'content',
			content: 'import "/page.js";',
			groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
		},
		{
			kind: 'script',
			source: 'content',
			content: 'import "/lazy.js";',
			groupedBundle: { id: 'bundle-1', entryName: 'lazy-entry' },
		},
	];

	await service.processDependencies(dependencies, undefined);
	await service.processDependencies(dependencies, undefined);

	expect(processGroupedMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - reuses service cache for content scripts across processDependencies calls', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/scripts/cached-content.js',
		kind: 'script' as const,
		inline: false,
		packageRole: 'page-script' as const,
		attributes: { type: 'module' },
		bundledSourceFilepaths: ['/test/src/helper.ts'],
	}));
	service.registerProcessor('script', 'content', { process: processMock });

	const dependency: AssetDefinition = {
		kind: 'script' as const,
		source: 'content',
		content: 'console.log("cached")',
		bundle: false,
	};

	await service.processDependencies([dependency], undefined);
	const [secondResult] = await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(secondResult?.bundledSourceFilepaths).toEqual(['/test/src/helper.ts']);
});

test('AssetProcessingService - materializes inline bundled cache hits from bundled output', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn((filepath) => filepath === '/test/dist/client/assets/scripts/bootstrap.js');
	fileSystem.readFileSync = vi.fn(() => 'console.log("bundled")');

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/scripts/bootstrap.js',
		kind: 'script' as const,
		inline: true,
		content: 'console.log("bundled")',
		attributes: { type: 'module' },
	}));
	service.registerProcessor('script', 'content', { process: processMock });

	const dependency: AssetDefinition = {
		kind: 'script' as const,
		source: 'content',
		content: 'import "/absolute/broken.js";',
		inline: true,
		bundle: true,
		attributes: { type: 'module' },
	};

	const [firstResult] = await service.processDependencies([dependency], undefined);
	expect(firstResult?.content).toBe('console.log("bundled")');

	const [secondResult] = await service.processDependencies([dependency], undefined);
	expect(secondResult?.content).toBe('console.log("bundled")');
	expect(secondResult?.content).not.toContain('absolute/broken');
	expect(processMock).toHaveBeenCalledTimes(1);
});

test('AssetProcessingService - a change to a produced file evicts its cached asset', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/invalidate.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/invalidate.js' };

	await service.processDependencies([dependency], undefined);
	expect(processMock).toHaveBeenCalledTimes(1);

	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/dist/client/assets/invalidate.js']);

	await service.processDependencies([dependency], undefined);
	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService clears the page cache when the source of a page script changes', async () => {
	vi.stubEnv('NODE_ENV', 'development');
	fileSystem.exists = vi.fn(() => true);
	fileSystem.hash = vi.fn().mockReturnValueOnce('source-v1').mockReturnValue('source-v2');

	const config = createTestConfig();
	const pageCache = new PageCacheService();
	requireAppRuntime(config).pageCache = pageCache;
	const clearPageCache = vi.spyOn(pageCache, 'clear');
	const service = new AssetProcessingService(config);
	const processMock = vi
		.fn()
		.mockResolvedValueOnce({
			filepath: '/test/dist/client/assets/page-v1.js',
			kind: 'script' as const,
			inline: false,
			packageRole: 'page-script' as const,
		})
		.mockResolvedValueOnce({
			filepath: '/test/dist/client/assets/page-v2.js',
			kind: 'script' as const,
			inline: false,
			packageRole: 'page-script' as const,
		});
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = {
		kind: 'script' as const,
		source: 'file',
		filepath: '/test/src/page.ts',
		packageRole: 'page-script' as const,
	};

	await service.processDependencies([dependency], undefined);
	expect(clearPageCache).not.toHaveBeenCalled();

	await service.processDependencies([dependency], undefined);
	expect(clearPageCache).toHaveBeenCalledTimes(1);
	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService clears the page cache when a page script keeps its source but moves its file path', async () => {
	vi.stubEnv('NODE_ENV', 'development');
	fileSystem.exists = vi.fn(() => true);

	const config = createTestConfig();
	const pageCache = new PageCacheService();
	requireAppRuntime(config).pageCache = pageCache;
	const clearPageCache = vi.spyOn(pageCache, 'clear');
	const service = new AssetProcessingService(config);
	let bundleVersion = 'v1';
	const processGroupedMock = vi.fn(async (deps: { groupedBundle?: { id: string; entryName: string } }[]) =>
		deps.map((dep) => ({
			filepath: `/test/dist/client/assets/${dep.groupedBundle?.entryName}-${bundleVersion}.js`,
			kind: 'script' as const,
			inline: false,
			groupedBundle: dep.groupedBundle,
			packageRole: 'page-script' as const,
		})),
	);
	service.registerProcessor('script', 'file', { process: vi.fn(), processGrouped: processGroupedMock });

	const page: AssetDefinition = {
		kind: 'script' as const,
		source: 'file',
		filepath: '/test/src/page.ts',
		packageRole: 'page-script' as const,
		groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
	};
	const sibling: AssetDefinition = {
		kind: 'script' as const,
		source: 'file',
		filepath: '/test/src/sibling.ts',
		packageRole: 'page-script' as const,
		groupedBundle: { id: 'bundle-1', entryName: 'sibling-entry' },
	};

	await service.processDependencies([page], undefined);
	expect(clearPageCache).not.toHaveBeenCalled();

	bundleVersion = 'v2';
	await service.processDependencies([page, sibling], undefined);

	expect(processGroupedMock).toHaveBeenCalledTimes(2);
	expect(clearPageCache).toHaveBeenCalledTimes(1);
});

test('AssetProcessingService - skips missing file dependencies', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => false);

	const service = new AssetProcessingService(Config);
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/missing.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });

	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: 'path/to/missing.js' };

	const results = await service.processDependencies([dependency], undefined);

	expect(processMock).not.toHaveBeenCalled();
	expect(results.length).toBe(0);
});

test('AssetProcessingService - restores grouped content-script metadata from in-memory cache', async () => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.gzipDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);

	const service = new AssetProcessingService(Config);
	const processGroupedMock = vi.fn(async () => [
		{
			filepath: '/test/dist/client/assets/scripts/ecopages-react.js',
			kind: 'script' as const,
			inline: false,
			groupedBundle: { id: 'ecopages-react-router-pages', entryName: 'pages__index' },
		},
	]);
	service.registerProcessor('script', 'content', {
		process: vi.fn(),
		processGrouped: processGroupedMock,
	});

	const dependency: AssetDefinition = {
		kind: 'script' as const,
		source: 'content',
		content: 'console.log("hydrate")',
		name: 'ecopages-react-123',
		bundle: false,
		packageRole: 'page-script' as const,
		groupedBundle: { id: 'ecopages-react-router-pages', entryName: 'pages__index' },
		attributes: { type: 'module', 'data-eco-page-bootstrap': 'react-router' },
	};

	await service.processDependencies([dependency], undefined);
	const results = await service.processDependencies([dependency], undefined);

	expect(processGroupedMock).toHaveBeenCalledTimes(1);
	expect(results[0]?.groupedBundle).toEqual({
		id: 'ecopages-react-router-pages',
		entryName: 'pages__index',
	});
	expect(results[0]?.attributes).toEqual({
		type: 'module',
		'data-eco-page-bootstrap': 'react-router',
	});
});

test('AssetProcessingService - shares one processor run between concurrent requests for the same asset', async () => {
	fileSystem.exists = vi.fn(() => true);
	const service = new AssetProcessingService(createTestConfig());
	let finishProcessing!: () => void;
	const processing = new Promise<void>((resolve) => {
		finishProcessing = resolve;
	});
	const processMock = vi.fn(async () => {
		await processing;
		return { filepath: '/test/dist/client/assets/shared.js', kind: 'script' as const, inline: false };
	});
	service.registerProcessor('script', 'file', { process: processMock });
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/shared.ts' };

	const first = service.processDependencies([dependency], undefined);
	const second = service.processDependencies([dependency], undefined);
	await vi.waitFor(() => expect(processMock).toHaveBeenCalled());
	finishProcessing();
	const [firstAssets, secondAssets] = await Promise.all([first, second]);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(firstAssets.map((asset) => asset.filepath)).toEqual(['/test/dist/client/assets/shared.js']);
	expect(secondAssets.map((asset) => asset.filepath)).toEqual(['/test/dist/client/assets/shared.js']);
});

test('AssetProcessingService - starts a new processor run for a request made after the asset changed', async () => {
	fileSystem.exists = vi.fn(() => true);
	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	let finishFirst!: () => void;
	const firstRun = new Promise<void>((resolve) => {
		finishFirst = resolve;
	});
	const processMock = vi
		.fn()
		.mockImplementationOnce(async () => {
			await firstRun;
			return { filepath: '/test/dist/client/assets/fresh.js', kind: 'script' as const, inline: false };
		})
		.mockImplementation(async () => ({
			filepath: '/test/dist/client/assets/fresh.js',
			kind: 'script' as const,
			inline: false,
		}));
	service.registerProcessor('script', 'file', { process: processMock });
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/fresh.ts' };

	const stale = service.processDependencies([dependency], undefined);
	await vi.waitFor(() => expect(processMock).toHaveBeenCalledTimes(1));
	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/src/fresh.ts']);
	const fresh = service.processDependencies([dependency], undefined);
	finishFirst();
	await Promise.all([stale, fresh]);

	expect(processMock).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - gzips a production asset once, not on every request that finds it cached', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	fileSystem.exists = vi.fn(() => true);
	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	service.registerProcessor('script', 'file', {
		process: vi.fn(async () => ({
			filepath: '/test/dist/client/assets/gzip-once.js',
			kind: 'script' as const,
			inline: false,
			sourceFilepath: '/test/src/gzip-once.ts',
		})),
	});
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/gzip-once.ts' };

	await service.processDependencies([dependency], undefined);
	await service.processDependencies([dependency], undefined);
	await service.processDependencies([dependency], undefined);
	expect(fileSystem.gzipFile).toHaveBeenCalledTimes(1);

	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/src/gzip-once.ts']);
	await service.processDependencies([dependency], undefined);
	expect(fileSystem.gzipFile).toHaveBeenCalledTimes(2);
});

test('AssetProcessingService - reuses a cached asset in production without re-reading its source', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	fileSystem.exists = vi.fn(() => true);
	const hash = vi.fn(() => 'v1');
	fileSystem.hash = hash;
	const service = new AssetProcessingService(createTestConfig());
	const processMock = vi.fn(async () => ({
		filepath: '/test/dist/client/assets/reuse.js',
		kind: 'script' as const,
		inline: false,
	}));
	service.registerProcessor('script', 'file', { process: processMock });
	const dependency: AssetDefinition = { kind: 'script' as const, source: 'file', filepath: '/test/src/reuse.ts' };

	await service.processDependencies([dependency], undefined);
	const hashesAfterFirstRun = hash.mock.calls.length;
	hash.mockReturnValue('v2');
	await service.processDependencies([dependency], undefined);

	expect(processMock).toHaveBeenCalledTimes(1);
	expect(hash.mock.calls.length).toBe(hashesAfterFirstRun);
});

test('AssetProcessingService - a sealed ledger serves every recorded dependency without processing or writing', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	fileSystem.exists = vi.fn(() => true);
	const appConfig = createTestConfig();
	const ledger = requireAppRuntime(appConfig).processedAssets;
	const contentScript: AssetDefinition = { kind: 'script', source: 'content', content: 'go()', bundle: false };
	const stylesheet: AssetDefinition = { kind: 'stylesheet', source: 'file', filepath: '/test/src/page.css' };
	const scriptAsset: ProcessedAsset = { kind: 'script', filepath: '/test/dist/client/assets/go.js', inline: false };
	const styleAsset: ProcessedAsset = { kind: 'stylesheet', filepath: '/test/dist/client/assets/page.css' };
	ledger.record(contentScript, scriptAsset);
	ledger.record(stylesheet, styleAsset);
	ledger.seal();
	const service = new AssetProcessingService(appConfig);
	const process = vi.fn(Processor.process);
	service.registerProcessor('script', 'content', { process });
	service.registerProcessor('stylesheet', 'file', { process });

	const results = await service.processDependencies([contentScript, stylesheet], undefined);

	expect(results.map((asset) => asset.srcUrl)).toEqual(['/assets/go.js', '/assets/page.css']);
	expect(process).not.toHaveBeenCalled();
	expect(fileSystem.write).not.toHaveBeenCalled();
	expect(fileSystem.ensureDir).not.toHaveBeenCalled();
	expect(fileSystem.gzipFile).not.toHaveBeenCalled();
});

test('AssetProcessingService - a sealed ledger rejects a dependency it does not record, without processing it', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	fileSystem.exists = vi.fn(() => true);
	const appConfig = createTestConfig();
	requireAppRuntime(appConfig).processedAssets.seal();
	const service = new AssetProcessingService(appConfig);
	const process = vi.fn(Processor.process);
	service.registerProcessor('script', 'content', { process });

	await expect(
		service.processDependencies(
			[{ kind: 'script', source: 'content', content: 'late()', name: 'late' }],
			undefined,
		),
	).rejects.toThrow('The production build did not record the script content late. Run `ecopages build` again.');
	expect(process).not.toHaveBeenCalled();
	expect(fileSystem.write).not.toHaveBeenCalled();
});

test('AssetProcessingService - a production build records every dependency it processes, content included', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	fileSystem.exists = vi.fn(() => true);
	const appConfig = createTestConfig();
	const service = new AssetProcessingService(appConfig);
	service.registerProcessor('script', 'content', { process: vi.fn(Processor.process) });
	const contentScript: AssetDefinition = { kind: 'script', source: 'content', content: 'go()', bundle: false };

	await service.processDependencies([contentScript], undefined);

	expect(requireAppRuntime(appConfig).processedAssets.lookup(contentScript)?.filepath).toBe(
		path.resolve('/test/dist/client/assets/test.js'),
	);
});

/**
 * @remarks
 * Loads the service with the Windows flavor of `@ecopages/file-system/path`, so a processor's backslash path is
 * read as a Windows file path on any OS.
 */
test('AssetProcessingService - processDependencies - reads a backslash Windows srcUrl as a file path, not a URL', async () => {
	vi.resetModules();
	vi.doMock('@ecopages/file-system/path', async (importOriginal) => {
		const actual = await importOriginal<typeof import('@ecopages/file-system/path')>();
		return { ...actual, path: actual.createPath('win32') };
	});
	try {
		const { fileSystem: windowsFileSystem } = await import('@ecopages/file-system');
		vi.spyOn(windowsFileSystem, 'ensureDir').mockImplementation(() => {});
		vi.spyOn(windowsFileSystem, 'exists').mockReturnValue(true);
		vi.spyOn(windowsFileSystem, 'hash').mockReturnValue('hash');
		const { AssetProcessingService: WindowsAssetProcessingService } = await import('./asset-processing.service');
		const service = new WindowsAssetProcessingService(
			createTestConfig({
				rootDir: 'D:/app',
				absolutePaths: { ...Config.absolutePaths, distDir: 'D:/app/dist/client', srcDir: 'D:/app/src' },
			}),
		);
		service.registerProcessor('script', 'file', {
			process: vi.fn(async () => ({
				srcUrl: 'C:\\other\\x.js',
				filepath: 'D:/app/dist/client/assets/x.js',
				kind: 'script' as const,
				inline: false,
			})),
		});

		const results = await service.processDependencies(
			[{ kind: 'script' as const, source: 'file', filepath: 'D:/app/src/x.js' }],
			undefined,
		);

		expect(results[0].srcUrl).toBe('/assets/x.js');
	} finally {
		vi.doUnmock('@ecopages/file-system/path');
		vi.resetModules();
	}
});
