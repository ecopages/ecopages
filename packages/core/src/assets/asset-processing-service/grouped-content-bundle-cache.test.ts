import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { BuildInputDependencyIndex } from '../../build/cache/build-input-dependency-index.ts';
import { requireAppRuntime, type AppRuntime } from '../../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { AssetProcessingService } from './asset-processing.service.ts';
import type { ContentScriptAsset } from './assets.types.ts';

const createConfig = (): EcoPagesAppConfig =>
	({
		absolutePaths: {
			distDir: '/test/dist',
		},
		appRuntime: {
			buildInputIndex: new BuildInputDependencyIndex(),
		} as AppRuntime,
	}) as unknown as EcoPagesAppConfig;

const originalEnsureDir = fileSystem.ensureDir;
const originalExists = fileSystem.exists;

beforeEach(() => {
	fileSystem.ensureDir = vi.fn(() => {});
	fileSystem.exists = vi.fn(() => true);
	vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
	fileSystem.ensureDir = originalEnsureDir;
	fileSystem.exists = originalExists;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test('AssetProcessingService caches grouped outputs as a complete dependency set', async () => {
	const service = new AssetProcessingService(createConfig());
	let buildNumber = 0;
	const processGroupedMock = vi.fn(async (deps: { groupedBundle?: ContentScriptAsset['groupedBundle'] }[]) => {
		buildNumber += 1;
		return deps.map((dep) => ({
			filepath: `/test/dist/assets/${dep.groupedBundle?.entryName}-build-${buildNumber}.js`,
			kind: 'script' as const,
			inline: false,
			groupedBundle: dep.groupedBundle,
		}));
	});
	service.registerProcessor('script', 'content', { process: vi.fn(), processGrouped: processGroupedMock });

	const entry = (entryName: string): ContentScriptAsset => ({
		kind: 'script',
		source: 'content',
		content: `import './${entryName}.ts';`,
		groupedBundle: { id: 'browser-client', entryName },
	});
	const islandOne = entry('island-one');
	const islandTwo = entry('island-two');
	const islandThree = entry('island-three');

	await service.processDependencies([islandOne, islandTwo], undefined);
	await service.processDependencies([islandOne, islandThree], undefined);
	const pageAResults = await service.processDependencies([islandOne, islandTwo], undefined);
	const cachedPageAResults = await service.processDependencies([islandOne, islandTwo], undefined);

	expect(processGroupedMock).toHaveBeenCalledTimes(3);
	expect(pageAResults.map((asset) => asset.filepath)).toEqual([
		'/test/dist/assets/island-one-build-3.js',
		'/test/dist/assets/island-two-build-3.js',
	]);
	expect(cachedPageAResults.map((asset) => asset.filepath)).toEqual(pageAResults.map((asset) => asset.filepath));
});

test('AssetProcessingService invalidates a grouped cache when a bundled input changes', async () => {
	const appConfig = createConfig();
	const service = new AssetProcessingService(appConfig);
	let buildNumber = 0;
	const processGroupedMock = vi.fn(async (deps: { groupedBundle?: ContentScriptAsset['groupedBundle'] }[]) => {
		buildNumber += 1;
		return deps.map((dep) => ({
			filepath: `/test/dist/assets/${dep.groupedBundle?.entryName}-build-${buildNumber}.js`,
			kind: 'script' as const,
			inline: false,
			groupedBundle: dep.groupedBundle,
			bundledSourceFilepaths: ['/test/src/shared-store.ts'],
		}));
	});
	service.registerProcessor('script', 'content', { process: vi.fn(), processGrouped: processGroupedMock });

	const dependencies: ContentScriptAsset[] = [
		{
			kind: 'script',
			source: 'content',
			content: "import './first.ts';",
			groupedBundle: { id: 'browser-client', entryName: 'island-one' },
		},
		{
			kind: 'script',
			source: 'content',
			content: "import './second.ts';",
			groupedBundle: { id: 'browser-client', entryName: 'island-two' },
		},
	];

	await service.processDependencies(dependencies, undefined);
	requireAppRuntime(appConfig).buildInputIndex.recordChanges(['/test/src/shared-store.ts']);
	const results = await service.processDependencies(dependencies, undefined);

	expect(processGroupedMock).toHaveBeenCalledTimes(2);
	expect(results.map((asset) => asset.filepath)).toEqual([
		'/test/dist/assets/island-one-build-2.js',
		'/test/dist/assets/island-two-build-2.js',
	]);
});
