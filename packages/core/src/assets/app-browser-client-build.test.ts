import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { beforeEach, afterEach, test, vi } from 'vitest';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { BuildSuccess } from '../build/build-adapter.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { AssetDefinition } from './asset-processing-service/assets.types.ts';
import { ProcessedAssetLedger } from './asset-processing-service/processed-asset-ledger.ts';
import { prepareAssetDependencies } from './asset-processing-service/asset-processing.service.ts';
import type { AppRuntime } from '../config/assembly/app-runtime.ts';

const { bundleGroupedEntries, setPrebuiltUrls, htmlScriptPath } = vi.hoisted(() => ({
	bundleGroupedEntries: vi.fn(),
	setPrebuiltUrls: vi.fn(),
	htmlScriptPath: { value: '' },
}));

vi.mock('./browser-bundle.service.ts', () => ({
	BrowserBundleService: class {
		bundleGroupedEntries = bundleGroupedEntries;
	},
}));

vi.mock('../html-pages/html-page-module-scripts.ts', () => ({
	collectHtmlPageModuleScriptBuildInputs: () => ({
		htmlFiles: [],
		scripts: [htmlScriptPath.value],
		files: [htmlScriptPath.value],
		fingerprint: 'html-scripts',
	}),
	setPrebuiltHtmlPageModuleScriptUrls: setPrebuiltUrls,
}));

import { buildAppBrowserClient } from './app-browser-client-build.ts';

function required<T>(value: T | undefined): T {
	assert.ok(value);
	return value;
}

function createIslandEntry(
	rootDir: string,
	islandName: string,
): { integrationName: string; dependency: Extract<AssetDefinition, { kind: 'script' }> } {
	const islandFile = path.join(rootDir, 'src', `${islandName}.tsx`);
	return {
		integrationName: 'react',
		dependency: {
			kind: 'script' as const,
			source: 'content' as const,
			content: `import ${JSON.stringify(islandFile)};`,
			bundle: true,
			position: 'head' as const,
			attributes: { type: 'module', 'data-eco-script-id': islandName },
		},
	};
}

function createLazyEntry(): NonNullable<GroupedGraphBuildPlan['instances'][number]['pageClientBuildEntries']>[number] {
	return {
		integrationName: 'ecopages-jsx',
		dependency: {
			kind: 'script',
			source: 'content',
			content: 'console.log("lazy client entry");',
			bundle: true,
			position: 'head',
			attributes: { type: 'module', 'data-eco-lazy-key': 'lazy-route-a' },
		},
	};
}

function createGroupedIntegration(name: string, bundleId: string) {
	return {
		name,
		prepareAssetDependencies(dependencies: AssetDefinition[]) {
			for (const dependency of dependencies) {
				if (dependency.kind !== 'script') continue;
				dependency.groupedBundle = { id: bundleId, entryName: `${name}-route-script` };
			}
			return dependencies;
		},
	};
}

function createTestAppConfig(rootDir: string): EcoPagesAppConfig {
	return {
		rootDir,
		appRuntime: { processedAssets: new ProcessedAssetLedger(rootDir) } as AppRuntime,
		integrations: [
			createGroupedIntegration('ecopages-jsx', 'jsx-page'),
			createGroupedIntegration('lit', 'lit-page'),
		],
		absolutePaths: {
			rootDir,
			srcDir: path.join(rootDir, 'src'),
			pagesDir: path.join(rootDir, 'pages'),
			distDir: path.join(rootDir, 'dist', 'client'),
			workDir: path.join(rootDir, '.eco'),
		},
	} as unknown as EcoPagesAppConfig;
}

function createRouteInstance(
	rootDir: string,
	routeName: string,
	routeScript: AssetDefinition,
	pageClientBuildEntries: NonNullable<GroupedGraphBuildPlan['instances'][number]['pageClientBuildEntries']> = [
		createIslandEntry(rootDir, `island-${routeName}`),
	],
) {
	return {
		routeFile: path.join(rootDir, 'pages', `${routeName}.tsx`),
		dependencyInstanceKey: '',
		contribution: { dependencies: [{ ...routeScript }] },
		pageClientBuildEntries,
	};
}

function ledgerOf(appConfig: EcoPagesAppConfig): ProcessedAssetLedger {
	return required(appConfig.appRuntime).processedAssets;
}

/** The route script as asset processing prepares it for `integrationName`, which is how rendering looks it up. */
function preparedRouteScript(
	appConfig: EcoPagesAppConfig,
	routeScript: AssetDefinition,
	integrationName: string,
): AssetDefinition {
	const integration = appConfig.integrations.find((entry) => entry.name === integrationName);
	return required(prepareAssetDependencies([{ ...routeScript }], integration, appConfig.rootDir)[0]);
}

function assertHtmlModuleScriptUrls(): void {
	const buildCall = required(setPrebuiltUrls.mock.calls[0]);
	const urls = buildCall[1] as Map<string, string> | undefined;
	const htmlUrl = required(urls?.get(realpathSync(htmlScript)));
	assert.ok(htmlUrl.startsWith('/assets/html-'));
	assert.ok(htmlUrl.endsWith('-hash.js'));
}

let rootDir = '';
let htmlScript = '';
let originalGzipFile: typeof fileSystem.gzipFile;

beforeEach(() => {
	rootDir = mkdtempSync(path.join(os.tmpdir(), 'eco-app-browser-build-'));
	htmlScript = path.join(rootDir, 'src', 'shell.ts');
	mkdirSync(path.dirname(htmlScript), { recursive: true });
	writeFileSync(htmlScript, 'export const shell = true;');
	const htmlPackageEntry = path.join(rootDir, 'node_modules', 'html-only-package', 'index.js');
	mkdirSync(path.dirname(htmlPackageEntry), { recursive: true });
	writeFileSync(htmlPackageEntry, 'export const htmlPackage = true;');
	htmlScriptPath.value = htmlScript;
	originalGzipFile = fileSystem.gzipFile;
	fileSystem.gzipFile = vi.fn(() => {});
	bundleGroupedEntries.mockReset();
	setPrebuiltUrls.mockReset();
	bundleGroupedEntries.mockImplementation(
		async (entries: Array<{ entryName: string; entrypoint: string }>, options: { outdir: string }) => {
			const outputs = entries.map(({ entryName }) => ({
				path: path.join(options.outdir, `${entryName}-hash.js`),
			}));
			return {
				success: true,
				outputs: [...outputs, { path: path.join(options.outdir, 'shared-chunk.js') }],
				warnings: [],
				loadedInputs: [],
				loadedInputsByModule: {},
				dependencyGraph: {
					entrypoints: Object.fromEntries(
						entries.map(({ entrypoint }) => [
							entrypoint,
							entrypoint === htmlScript ? [entrypoint, htmlPackageEntry] : [entrypoint],
						]),
					),
				},
				entryOutputs: Object.fromEntries(
					entries.map(({ entryName }, index) => [entryName, outputs[index]?.path]),
				),
				outputGraph: {},
			} satisfies BuildSuccess;
		},
	);
});

afterEach(() => {
	fileSystem.gzipFile = originalGzipFile;
	rmSync(rootDir, { recursive: true, force: true });
});

test('buildAppBrowserClient records each entry output in the ledger under every declaring dependency key', async () => {
	const routeScript = {
		kind: 'script' as const,
		source: 'content' as const,
		content: 'import "./shared-store.js";',
		bundle: true,
		position: 'head' as const,
	};
	const appConfig = createTestAppConfig(rootDir);
	const islandA = createIslandEntry(rootDir, 'island-a');
	const lazyEntry = createLazyEntry();
	const plans = [
		{
			integrationName: 'ecopages-jsx',
			instances: [
				createRouteInstance(rootDir, 'a', routeScript, [islandA, lazyEntry]),
				createRouteInstance(rootDir, 'b', routeScript),
			],
		},
		{
			integrationName: 'lit',
			instances: [createRouteInstance(rootDir, 'c', routeScript, [])],
		},
	];

	await buildAppBrowserClient(appConfig, plans);

	assert.equal(bundleGroupedEntries.mock.calls.length, 1);
	assert.equal(required(bundleGroupedEntries.mock.calls[0])[0].length, 6);
	const ledger = ledgerOf(appConfig);
	const jsxRouteAsset = required(ledger.lookup(preparedRouteScript(appConfig, routeScript, 'ecopages-jsx')));
	const litRouteAsset = required(ledger.lookup(preparedRouteScript(appConfig, routeScript, 'lit')));
	assert.match(jsxRouteAsset.srcUrl ?? '', /^\/assets\/client-[a-f0-9]+-hash\.js$/);
	assert.notEqual(jsxRouteAsset.srcUrl, litRouteAsset.srcUrl);
	assert.match(required(ledger.lookup(islandA.dependency)).srcUrl ?? '', /^\/assets\/client-[a-f0-9]+-hash\.js$/);
	assert.equal(required(ledger.lookup(lazyEntry.dependency)).attributes?.['data-eco-lazy-key'], 'lazy-route-a');
	assert.equal(ledger.hasBrowserBuild, true);
	assert.ok(ledger.serialize().browserOutputs?.includes('dist/client/assets/shared-chunk.js'));
	assertHtmlModuleScriptUrls();
});

test('buildAppBrowserClient records a shared script once however many routes declare it', async () => {
	const routeScript: Extract<AssetDefinition, { kind: 'script' }> = {
		kind: 'script',
		source: 'content',
		content: 'import "./shared-store.js";',
		bundle: true,
		position: 'head',
	};
	const recordFor = async (routeCount: number) => {
		bundleGroupedEntries.mockClear();
		const appConfig = createTestAppConfig(rootDir);
		await buildAppBrowserClient(appConfig, [
			{
				integrationName: 'ecopages-jsx',
				instances: Array.from({ length: routeCount }, (_, index) =>
					createRouteInstance(rootDir, `route-${index}`, routeScript, [
						createIslandEntry(rootDir, 'shared-island'),
					]),
				),
				bundledScripts: Array.from({ length: routeCount }, () => ({
					kind: 'script' as const,
					source: 'file' as const,
					filepath: path.join(rootDir, 'src', 'counter.script.ts'),
				})),
			},
		]);
		return ledgerOf(appConfig).serialize();
	};

	const twoRoutes = await recordFor(2);
	const sixRoutes = await recordFor(6);

	assert.equal(twoRoutes.entries.length, 3);
	assert.deepEqual(sixRoutes, twoRoutes);
});

test('buildAppBrowserClient records outputs that a build moved to another folder restores', async () => {
	const componentScript = (appRoot: string): Extract<AssetDefinition, { source: 'file' }> => ({
		kind: 'script',
		source: 'file',
		filepath: path.join(appRoot, 'src', 'components', 'counter.script.ts'),
		position: 'head',
	});
	const appConfig = createTestAppConfig(rootDir);
	await buildAppBrowserClient(appConfig, [
		{ integrationName: 'lit', instances: [], bundledScripts: [componentScript(rootDir)] },
	]);
	const built = required(ledgerOf(appConfig).lookup(componentScript(rootDir)));

	const movedRoot = path.join(rootDir, 'moved');
	const moved = new ProcessedAssetLedger(movedRoot);
	moved.restore(JSON.parse(JSON.stringify(ledgerOf(appConfig).serialize())));
	const restored = required(moved.lookup(componentScript(movedRoot)));

	assert.equal(restored.srcUrl, built.srcUrl);
	assert.equal(restored.filepath, path.join(movedRoot, path.relative(rootDir, required(built.filepath))));
	assert.equal(restored.sourceFilepath, componentScript(movedRoot).filepath);
	assert.doesNotMatch(JSON.stringify(ledgerOf(appConfig).serialize()), /\\/);
	assert.ok(!JSON.stringify(ledgerOf(appConfig).serialize()).includes(rootDir));
});

test('buildAppBrowserClient builds entries apart only when build-wide options differ', async () => {
	const appConfig = createTestAppConfig(rootDir);
	const specialRouteScript: AssetDefinition = {
		kind: 'script',
		source: 'content',
		content: 'import "./special-route.js";',
		bundle: true,
		position: 'head',
		bundleOptions: {
			external: ['special-dependency'],
			excludeAppBuildPlugins: ['special-plugin'],
			splitting: false,
			minify: false,
		},
	};
	const defaultRouteScript: AssetDefinition = {
		kind: 'script',
		source: 'content',
		content: 'import "./default-route.js";',
		bundle: true,
		position: 'head',
	};
	const plan = {
		integrationName: 'ecopages-jsx',
		instances: [
			createRouteInstance(rootDir, 'special', specialRouteScript, []),
			createRouteInstance(rootDir, 'default', defaultRouteScript, []),
		],
	};

	await buildAppBrowserClient(appConfig, [plan]);

	assert.equal(bundleGroupedEntries.mock.calls.length, 2);
	const specialBuild = required(
		bundleGroupedEntries.mock.calls.find(([, options]) => options.external?.includes('special-dependency')),
	);
	assert.equal(specialBuild[0].length, 1);
	assert.equal(specialBuild[1].excludeAppBuildPlugins?.includes('special-plugin'), true);
	assert.equal(specialBuild[1].splitting, true);
	assert.equal(specialBuild[1].minify, false);
	const defaultBuild = required(
		bundleGroupedEntries.mock.calls.find(([, options]) => options.external === undefined),
	);
	assert.equal(defaultBuild[1].excludeAppBuildPlugins, undefined);
	assert.equal(defaultBuild[1].splitting, true);
	assert.equal(defaultBuild[1].minify, true);
	assert.equal(
		defaultBuild[0].some((entry: { entryName: string }) => entry.entryName.startsWith('html-')),
		true,
	);
});

test('buildAppBrowserClient combines compatible entry-scoped plugins and keeps each plugin config', async () => {
	const firstBoundary: EcoBuildPlugin = {
		name: 'ecopages-client-graph-boundary',
		cacheKey: 'first-island',
		bundleGroupKey: 'react-client-graph-boundary',
		setup() {},
	};
	const secondBoundary: EcoBuildPlugin = {
		name: 'ecopages-client-graph-boundary',
		cacheKey: 'second-island',
		bundleGroupKey: 'react-client-graph-boundary',
		setup() {},
	};
	const firstIsland = createIslandEntry(rootDir, 'island-first');
	const secondIsland = createIslandEntry(rootDir, 'island-second');
	firstIsland.dependency.bundleOptions = { plugins: [firstBoundary] };
	secondIsland.dependency.bundleOptions = { plugins: [secondBoundary] };
	const plan = {
		integrationName: 'ecopages-jsx',
		instances: [
			createRouteInstance(
				rootDir,
				'first',
				{
					kind: 'script',
					source: 'content',
					content: 'import "./first-route.js";',
					bundle: true,
					position: 'head',
				},
				[firstIsland],
			),
			createRouteInstance(
				rootDir,
				'second',
				{
					kind: 'script',
					source: 'content',
					content: 'import "./second-route.js";',
					bundle: true,
					position: 'head',
				},
				[secondIsland],
			),
		],
	};

	await buildAppBrowserClient(createTestAppConfig(rootDir), [plan]);

	assert.equal(bundleGroupedEntries.mock.calls.length, 1);
	const buildCall = required(bundleGroupedEntries.mock.calls[0]);
	assert.equal(buildCall[0].length, 5);
	const plugins = buildCall[1].plugins as EcoBuildPlugin[];
	assert.deepEqual(
		plugins.map((plugin) => plugin.cacheKey),
		['first-island', 'second-island'],
	);
	const entryNames = new Set(buildCall[0].map((entry: { entryName: string }) => entry.entryName));
	for (const plugin of plugins) {
		assert.equal(plugin.entryScope?.length, 2);
		assert.ok(plugin.entryScope?.every((entryName) => entryNames.has(entryName)));
		assert.deepEqual(plugin.entryScope, plugins[0]?.entryScope);
	}
});

test('buildAppBrowserClient builds entries with different plugins together and scopes each plugin', async () => {
	const islandPlugin: EcoBuildPlugin = { name: 'island-only-plugin', setup() {} };
	const island = createIslandEntry(rootDir, 'island-scoped');
	island.dependency.bundleOptions = { plugins: [islandPlugin], external: ['island-runtime'] };
	const plan = {
		integrationName: 'react',
		instances: [
			createRouteInstance(
				rootDir,
				'scoped',
				{
					kind: 'script',
					source: 'content',
					content: 'import "./scoped-route.js";',
					bundle: true,
					position: 'head',
				},
				[island],
			),
		],
	};

	await buildAppBrowserClient(createTestAppConfig(rootDir), [plan]);

	assert.equal(bundleGroupedEntries.mock.calls.length, 1);
	const [entries, options] = required(bundleGroupedEntries.mock.calls[0]);
	const [scopedPlugin] = options.plugins as EcoBuildPlugin[];
	assert.equal(scopedPlugin?.name, 'island-only-plugin');
	assert.equal(scopedPlugin?.entryScope?.length, 1);
	assert.ok(entries.length > 1);
	assert.deepEqual(options.external, ['island-runtime']);
});

test('buildAppBrowserClient separates entry-scoped plugins with different hook positions', async () => {
	const firstBoundary: EcoBuildPlugin = {
		name: 'ecopages-client-graph-boundary',
		cacheKey: 'first-island',
		bundleGroupKey: 'react-client-graph-boundary',
		setup() {},
	};
	const secondBoundary: EcoBuildPlugin = {
		name: 'ecopages-client-graph-boundary',
		cacheKey: 'second-island',
		bundleGroupKey: 'react-client-graph-boundary',
		setup() {},
	};
	const sharedPlugin: EcoBuildPlugin = { name: 'shared-plugin', setup() {} };
	const firstIsland = createIslandEntry(rootDir, 'island-first');
	const secondIsland = createIslandEntry(rootDir, 'island-second');
	firstIsland.dependency.bundleOptions = { plugins: [firstBoundary, sharedPlugin] };
	secondIsland.dependency.bundleOptions = { plugins: [sharedPlugin, secondBoundary] };
	const plan = {
		integrationName: 'react',
		instances: [
			{
				routeFile: path.join(rootDir, 'pages', 'first.tsx'),
				dependencyInstanceKey: '',
				contribution: { dependencies: [] },
				pageClientBuildEntries: [firstIsland],
			},
			{
				routeFile: path.join(rootDir, 'pages', 'second.tsx'),
				dependencyInstanceKey: '',
				contribution: { dependencies: [] },
				pageClientBuildEntries: [secondIsland],
			},
		],
	};

	await buildAppBrowserClient(createTestAppConfig(rootDir), [plan]);

	assert.equal(bundleGroupedEntries.mock.calls.length, 2);
	assert.deepEqual(
		bundleGroupedEntries.mock.calls.map(([, options]) =>
			(options.plugins as EcoBuildPlugin[]).map((plugin) => plugin.cacheKey ?? plugin.name),
		),
		[
			['first-island', 'shared-plugin'],
			['shared-plugin', 'second-island'],
		],
	);
});
