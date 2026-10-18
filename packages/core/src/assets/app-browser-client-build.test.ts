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
): { integrationName: string; islandFile: string; dependency: Extract<AssetDefinition, { kind: 'script' }> } {
	const islandFile = path.join(rootDir, 'src', `${islandName}.tsx`);
	return {
		integrationName: 'react',
		islandFile,
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
		integrations: [
			createGroupedIntegration('ecopages-jsx', 'jsx-page'),
			createGroupedIntegration('lit', 'lit-page'),
		],
		absolutePaths: {
			rootDir,
			srcDir: path.join(rootDir, 'src'),
			pagesDir: path.join(rootDir, 'pages'),
			distDir: path.join(rootDir, 'dist'),
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

function assertRouteBuildAssets(
	plan: GroupedGraphBuildPlan,
	routeIndex: number,
	rootDir: string,
	routeName: string,
	pageClientAssetCount = 1,
): void {
	const route = required(plan.instances[routeIndex]);
	const graphAsset = required(route.prebuiltGroupedAssets?.[0]);
	const pageClientAssets = route.prebuiltPageClientBrowserAssets ?? {
		processedAssets: [],
		islandRenderAssetsByFile: new Map(),
	};
	assert.equal(route.prebuiltGroupedAssets?.length, 1);
	assert.equal(graphAsset.groupedBundle?.id, 'ecopages-app-browser-client');
	assert.equal(pageClientAssets.processedAssets.length, pageClientAssetCount);
	if (pageClientAssetCount > 0) {
		assert.equal(
			pageClientAssets.islandRenderAssetsByFile.has(path.join(rootDir, 'src', `island-${routeName}.tsx`)),
			true,
		);
	}
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

test('buildAppBrowserClient bundles route entries and HTML module scripts in one build', async () => {
	const routeScript = {
		kind: 'script' as const,
		source: 'content' as const,
		content: 'import "./shared-store.js";',
		bundle: true,
		position: 'head' as const,
	};
	const appConfig = createTestAppConfig(rootDir);
	const plans = [
		{
			integrationName: 'ecopages-jsx',
			planKey: 'routes',
			instances: [
				createRouteInstance(rootDir, 'a', routeScript, [
					createIslandEntry(rootDir, 'island-a'),
					createLazyEntry(),
				]),
				createRouteInstance(rootDir, 'b', routeScript),
			],
		},
		{
			integrationName: 'lit',
			planKey: 'lit-routes',
			instances: [createRouteInstance(rootDir, 'c', routeScript, [])],
		},
	];

	const build = await buildAppBrowserClient(appConfig, plans);
	const [jsxPlan, litPlan] = build.plans;

	assert.equal(bundleGroupedEntries.mock.calls.length, 1);
	assert.equal(required(bundleGroupedEntries.mock.calls[0])[0].length, 6);
	const plan = required(jsxPlan);
	const secondRendererPlan = required(litPlan);
	assertRouteBuildAssets(plan, 0, rootDir, 'a', 2);
	assertRouteBuildAssets(plan, 1, rootDir, 'b');
	assertRouteBuildAssets(secondRendererPlan, 0, rootDir, 'c', 0);
	const lazyAsset = required(
		plan.instances[0]?.prebuiltPageClientBrowserAssets?.processedAssets.find(
			(asset) => asset.attributes?.['data-eco-lazy-key'] === 'lazy-route-a',
		),
	);
	assert.match(lazyAsset.srcUrl ?? '', /^\/assets\/client-[a-f0-9]+-hash\.js$/);
	assert.equal(
		required(plan.instances[0]?.prebuiltGroupedAssets?.[0]).filepath,
		required(plan.instances[1]?.prebuiltGroupedAssets?.[0]).filepath,
	);
	assertHtmlModuleScriptUrls();
	assert.ok(build.sourceFiles.includes(path.join(rootDir, 'node_modules/html-only-package/index.js')));
	assert.ok(build.outputPaths.includes(path.join(rootDir, 'dist/assets/shared-chunk.js')));
});

test('buildAppBrowserClient scopes bundle options to entries with matching options', async () => {
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
		planKey: 'option-scopes',
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
	assert.equal(specialBuild[1].splitting, false);
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
		planKey: 'grouped-entry-plugins',
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
	assert.deepEqual(buildCall[1].plugins, [firstBoundary, secondBoundary]);
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
		planKey: 'grouped-entry-plugin-order',
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

	assert.equal(bundleGroupedEntries.mock.calls.length, 3);
	const boundaryBuilds = bundleGroupedEntries.mock.calls.filter(([, options]) =>
		(options.plugins as EcoBuildPlugin[] | undefined)?.some((plugin) => plugin.bundleGroupKey),
	);
	assert.equal(boundaryBuilds.length, 2);
	assert.deepEqual(
		boundaryBuilds.map(([, options]) => options.plugins),
		[
			[firstBoundary, sharedPlugin],
			[sharedPlugin, secondBoundary],
		],
	);
});
