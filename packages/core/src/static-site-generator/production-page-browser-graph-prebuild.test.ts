import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { getServerBundleOutputPaths } from '../build/server-bundle-deploy-manifest.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import type { AssetDefinition, ProcessedAsset } from '../assets/asset-processing-service/assets.types.ts';
import { getAssetDependencyKey } from '../assets/asset-processing-service/asset-dependency-keys.ts';
import { AssetFactory } from '../assets/asset-processing-service/asset.factory.ts';
import { APP_BROWSER_CLIENT_BUNDLE_ID } from '../assets/asset-processing-service/app-browser-client-bundle.ts';
import { packagePageDependencies } from '../route-renderer/page-loading/page-dependency-bundling.ts';
import {
	assertAppBrowserClientManifestHtmlOutputsExist,
	readAppBrowserClientManifest,
	restoreAppBrowserClientAssets,
	writeAppBrowserClientManifest,
} from '../assets/app-browser-client-manifest.ts';
import {
	getPrebuiltHtmlPageModuleScriptUrls,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	prebuildProductionPageBrowserGraphsFromManifest,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';

const { buildAppBrowserClientMock } = vi.hoisted(() => ({ buildAppBrowserClientMock: vi.fn() }));

vi.mock('../assets/app-browser-client-build.ts', () => ({
	buildAppBrowserClient: buildAppBrowserClientMock,
}));

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
	buildAppBrowserClientMock.mockReset();
});

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const rootDir of temporaryRoots.splice(0)) rmSync(rootDir, { recursive: true, force: true });
});

async function createAppConfig(rootDir?: string): Promise<EcoPagesAppConfig> {
	const appRoot = rootDir ?? mkdtempSync(path.join(os.tmpdir(), 'eco-production-prebuild-'));
	if (!rootDir) temporaryRoots.push(appRoot);
	return await finalizeEcoPagesConfig({ rootDir: appRoot });
}

function writeFile(filePath: string, content = ''): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, content);
}

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	vi.stubEnv('NODE_ENV', 'production');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	vi.stubEnv('NODE_ENV', 'development');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates, sorts, and groups route instances by renderer', async () => {
	const calls: Array<{
		rendererName: string;
		routeFile: string;
		params?: Record<string, string | string[]>;
		groupedBuildPlan?: { planKey: string };
	}> = [];
	const reactRouteFile = path.join(os.tmpdir(), 'pages/a/page.tsx');
	const litRouteFile = path.join(os.tmpdir(), 'pages/b/page.tsx');
	const reactRouteParams = { slug: 'alpha' };
	const litRouteParams = { slug: 'beta' };
	const createBuildInstance = (routeFile: string, params: Record<string, string>, srcUrl: string) => ({
		routeFile,
		dependencyInstanceKey: createPageDependencyInstanceKey({ params }),
		prebuiltGroupedAssets: [{ kind: 'script' as const, srcUrl }],
		pageClientBuildEntries: [],
	});
	const reactGroupedBuildPlan = {
		integrationName: 'react',
		planKey: 'react-plan',
		instances: [createBuildInstance(reactRouteFile, reactRouteParams, '/assets/react.js')],
	};
	const litGroupedBuildPlan = {
		integrationName: 'lit',
		planKey: 'lit-plan',
		instances: [createBuildInstance(litRouteFile, litRouteParams, '/assets/lit.js')],
	};
	const reactAppBrowserPlan = { ...reactGroupedBuildPlan, planKey: 'react-app-browser-client' };
	const litAppBrowserPlan = { ...litGroupedBuildPlan, planKey: 'lit-app-browser-client' };
	buildAppBrowserClientMock.mockResolvedValue({
		plans: [reactAppBrowserPlan, litAppBrowserPlan],
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map(),
	});
	const createRenderer = (rendererName: string, groupedBuildPlan: { planKey: string }) => ({
		buildGroupedGraphBuildPlan: vi.fn(async (_instances: unknown[], _options: unknown) => groupedBuildPlan),
		prebuildProductionPageBrowserGraph: async (
			filePath: string,
			options?: {
				params?: Record<string, string | string[]>;
				groupedBuildPlan?: { planKey: string };
			},
		) => {
			calls.push({
				rendererName,
				routeFile: filePath,
				params: options?.params,
				groupedBuildPlan: options?.groupedBuildPlan,
			});
		},
	});
	const reactRenderer = createRenderer('react', reactGroupedBuildPlan);
	const litRenderer = createRenderer('lit', litGroupedBuildPlan);
	const appConfig = await createAppConfig();
	const routeA = reactRouteFile;
	const routeB = litRouteFile;
	const routeRendererFactory = {
		getPageRenderer: (routeFile: string) => (routeFile.includes('/a/') ? reactRenderer : litRenderer) as never,
	};

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile: routeB, params: litRouteParams },
			{ routeFile: routeA, params: reactRouteParams },
			{ routeFile: routeA, params: reactRouteParams },
		],
		routeRendererFactory,
	);

	assert.equal(buildAppBrowserClientMock.mock.calls.length, 1);
	assert.deepEqual(buildAppBrowserClientMock.mock.calls[0], [
		appConfig,
		[reactGroupedBuildPlan, litGroupedBuildPlan],
	]);
	assert.deepEqual(reactRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: routeA, params: { slug: 'alpha' } },
	]);
	assert.deepEqual(litRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: routeB, params: { slug: 'beta' } },
	]);
	assert.deepEqual(calls, [
		{
			rendererName: 'react',
			routeFile: routeA,
			params: { slug: 'alpha' },
			groupedBuildPlan: reactAppBrowserPlan,
		},
		{
			rendererName: 'lit',
			routeFile: routeB,
			params: { slug: 'beta' },
			groupedBuildPlan: litAppBrowserPlan,
		},
	]);
	const manifest = readAppBrowserClientManifest(appConfig);
	assert.deepEqual(
		manifest?.entries.map(({ routeFile: file, params, groupedAssets }) => ({
			file,
			params,
			assetUrl: groupedAssets[0]?.srcUrl,
		})),
		[
			{
				file: path.relative(appConfig.rootDir, routeA).split(path.sep).join('/'),
				params: reactRouteParams,
				assetUrl: '/assets/react.js',
			},
			{
				file: path.relative(appConfig.rootDir, routeB).split(path.sep).join('/'),
				params: litRouteParams,
				assetUrl: '/assets/lit.js',
			},
		],
	);
});

test('prebuildProductionPageBrowserGraphs skips routes whose preparation failed', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/[slug].tsx');
	const failure = new Error('broken static props');
	const successfulInstance = {
		routeFile,
		dependencyInstanceKey: createPageDependencyInstanceKey({ params: { slug: 'healthy' } }),
		contribution: { assets: [] },
		pageClientBuildEntries: [],
		prebuiltPageClientBrowserAssets: {
			processedAssets: [],
			fallbackDependencies: [],
		},
	};
	const groupedBuildPlan = {
		integrationName: 'react',
		planKey: 'react-plan',
		instances: [successfulInstance],
	};
	buildAppBrowserClientMock.mockResolvedValue({
		plans: [{ ...groupedBuildPlan, planKey: 'app-browser-plan' }],
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map(),
	});
	const prebuiltRoutes: string[] = [];
	const renderer = {
		buildGroupedGraphBuildPlan: vi.fn(
			async (
				instances: Array<{ routeFile: string; params?: Record<string, string | string[]> }>,
				options?: {
					onRouteFailure?: (
						routeInstance: { routeFile: string; params?: Record<string, string | string[]> },
						error: unknown,
					) => void;
				},
			) => {
				const failedInstance = instances.find(({ params }) => params?.slug === 'broken');
				if (!failedInstance) throw new Error('Expected the failing route instance');
				options?.onRouteFailure?.(failedInstance, failure);
				return groupedBuildPlan;
			},
		),
		prebuildProductionPageBrowserGraph: vi.fn(async (routePath: string) => {
			prebuiltRoutes.push(routePath);
		}),
	};
	const routeRendererFactory = {
		getPageRenderer: () => renderer as never,
	};

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile, params: { slug: 'broken' } },
			{ routeFile, params: { slug: 'healthy' } },
		],
		routeRendererFactory,
	);

	assert.deepEqual(prebuiltRoutes, [routeFile]);
	assert.deepEqual(buildAppBrowserClientMock.mock.calls[0]?.[1], [groupedBuildPlan]);
});

test('clearProductionPageBrowserGraphSession clears production session records', async () => {
	const appConfig = await createAppConfig();
	const runtime = requireAppRuntime(appConfig);
	runtime.productionBrowserGraphsSealed = true;
	const clearSpy = vi.spyOn(runtime.pageBrowserGraphSession, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
	assert.equal(runtime.productionBrowserGraphsSealed, false);
});

test('prebuildProductionPageBrowserGraphsFromManifest restores app-wide outputs for SSR start', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/[slug].tsx');
	const params = { slug: 'intro' };
	const pageAsset: ProcessedAsset = {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/page.js'),
		sourceFilepath: path.join(appConfig.rootDir, 'src/page.tsx'),
		srcUrl: '/assets/page.js',
		kind: 'script',
	};
	const islandAsset: ProcessedAsset = {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/island.js'),
		srcUrl: '/assets/island.js',
		kind: 'script',
	};
	const fallbackDependency = {
		kind: 'script' as const,
		source: 'content' as const,
		content: 'window.fallbackClient = true;',
		inline: true,
	};
	const fallbackEntry = { integrationName: 'ecopages-jsx', dependency: fallbackDependency };
	const htmlPageFile = path.join(appConfig.absolutePaths.pagesDir, 'docs.html');
	const htmlScriptFile = path.join(appConfig.absolutePaths.srcDir, 'document.ts');
	writeFile(htmlPageFile, '<script type="module" src="../document.ts"></script>');
	writeFile(htmlScriptFile, 'export const documentScript = true;');
	writeFile(pageAsset.sourceFilepath!, 'export const page = true;');
	writeFile(pageAsset.filepath!);
	writeFile(islandAsset.filepath!);
	writeFile(path.join(appConfig.absolutePaths.distDir, 'assets/document.js'));
	const buildPlan: GroupedGraphBuildPlan = {
		integrationName: 'ecopages-jsx',
		planKey: 'app-browser-build-plan',
		instances: [
			{
				routeFile,
				dependencyInstanceKey: createPageDependencyInstanceKey({ params }),
				pageClientBuildEntries: [fallbackEntry],
				prebuiltGroupedAssets: [pageAsset],
				prebuiltPageClientBrowserAssets: {
					processedAssets: [islandAsset],
					fallbackDependencies: [fallbackEntry],
				},
			},
		],
	};
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map([[htmlScriptFile, '/assets/document.js']]));
	await writeAppBrowserClientManifest(appConfig, [buildPlan], [{ routeFile, params }], {
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map(),
	});
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	const currentPlan: GroupedGraphBuildPlan = {
		integrationName: 'ecopages-jsx',
		planKey: 'runtime-plan',
		instances: [
			{
				routeFile,
				dependencyInstanceKey: createPageDependencyInstanceKey({ params }),
				pageClientBuildEntries: [fallbackEntry],
				prebuiltPageClientBrowserAssets: {
					processedAssets: [],
					fallbackDependencies: [],
				},
			},
		],
	};
	let installedPlan: GroupedGraphBuildPlan | undefined;
	const renderer = {
		name: 'ecopages-jsx',
		buildGroupedGraphBuildPlan: vi.fn(async () => currentPlan),
		prebuildProductionPageBrowserGraph: vi.fn(
			async (_file: string, options: { groupedBuildPlan?: GroupedGraphBuildPlan }) => {
				installedPlan = options.groupedBuildPlan;
			},
		),
	};
	const routeRendererFactory = { getPageRenderer: () => renderer as never };

	assert.deepEqual(await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig), new Map());
	assert.equal(await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, routeRendererFactory), true);
	assert.equal(requireAppRuntime(runtimeAppConfig).productionBrowserGraphsSealed, true);
	assert.equal(buildAppBrowserClientMock.mock.calls.length, 0);
	assert.deepEqual(
		await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig),
		new Map([[htmlScriptFile, '/assets/document.js']]),
	);
	assert.equal(renderer.buildGroupedGraphBuildPlan.mock.calls.length, 1);
	assert.equal(renderer.prebuildProductionPageBrowserGraph.mock.calls.length, 1);
	assert.ok(installedPlan);
	assert.equal(installedPlan.planKey, 'app-browser-build-plan');
	const installedInstance = installedPlan.instances[0];
	assert.ok(installedInstance);
	assert.equal(installedInstance.prebuiltGroupedAssets?.[0]?.filepath, pageAsset.filepath);
	const restoredPageClientAssets = installedInstance.prebuiltPageClientBrowserAssets;
	assert.ok(restoredPageClientAssets);
	assert.equal(restoredPageClientAssets.processedAssets[0]?.filepath, islandAsset.filepath);
	assert.deepEqual(restoredPageClientAssets.fallbackDependencies, [fallbackEntry]);
});

test('prebuildProductionPageBrowserGraphsFromManifest restores bundled component scripts before rendering', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/index.tsx');
	const script: AssetDefinition = {
		kind: 'script',
		source: 'file',
		filepath: path.join(appConfig.rootDir, 'src/counter.script.ts'),
		position: 'head',
	};
	const scriptAsset: ProcessedAsset = {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/client-counter.js'),
		srcUrl: '/assets/client-counter.js',
		kind: 'script',
	};
	writeFile(scriptAsset.filepath!);
	const createPlan = (planKey: string): GroupedGraphBuildPlan => ({
		integrationName: 'ecopages-jsx',
		planKey,
		instances: [{ routeFile, dependencyInstanceKey: createPageDependencyInstanceKey({}) }],
		bundledScripts: [{ ...script }],
	});
	await writeAppBrowserClientManifest(appConfig, [createPlan('app-browser-build-plan')], [{ routeFile }], {
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map([[getAssetDependencyKey(script, appConfig.rootDir), scriptAsset]]),
	});
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const prebuiltScriptsWhenRendered: Array<ProcessedAsset | undefined> = [];
	const renderer = {
		name: 'ecopages-jsx',
		buildGroupedGraphBuildPlan: vi.fn(async () => createPlan('runtime-plan')),
		prebuildProductionPageBrowserGraph: vi.fn(async () => {
			prebuiltScriptsWhenRendered.push(
				requireAppRuntime(runtimeAppConfig).prebuiltBrowserScripts.get(
					getAssetDependencyKey(script, appConfig.rootDir),
				),
			);
		}),
	};

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, {
			getPageRenderer: () => renderer as never,
		}),
		true,
	);

	assert.equal(prebuiltScriptsWhenRendered.length, 1);
	assert.equal(prebuiltScriptsWhenRendered[0]?.filepath, scriptAsset.filepath);
	assert.equal(prebuiltScriptsWhenRendered[0]?.srcUrl, '/assets/client-counter.js');
});

test('prebuildProductionPageBrowserGraphsFromManifest restores a build moved to another folder', async () => {
	const parentDir = mkdtempSync(path.join(os.tmpdir(), 'eco-moved-build-'));
	temporaryRoots.push(parentDir);
	const buildRoot = path.join(parentDir, 'built-here');
	const startRoot = path.join(parentDir, 'started-there');
	const memberFiles = ['src/a.script.ts', 'src/b.script.ts'];
	for (const file of memberFiles) writeFile(path.join(buildRoot, file));
	/** The Page script route preparation bundles, named into its grouped bundle as ecopages-jsx does. */
	const pageScriptUnder = (rootDir: string): AssetDefinition => {
		const [pageScript] = packagePageDependencies(
			memberFiles.map((file) =>
				AssetFactory.createFileScript({
					filepath: path.join(rootDir, file),
					position: 'head',
					attributes: { type: 'module', defer: '' },
				}),
			),
			'ecopages-jsx',
			true,
			rootDir,
		);
		assert.ok(pageScript?.kind === 'script' && pageScript.source === 'content' && 'name' in pageScript);
		const entryName = String(pageScript.name);
		return { ...pageScript, groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName } };
	};
	const createPlan = (rootDir: string): GroupedGraphBuildPlan => ({
		integrationName: 'ecopages-jsx',
		planKey: 'plan',
		instances: [
			{
				routeFile: path.join(rootDir, 'pages/index.tsx'),
				dependencyInstanceKey: createPageDependencyInstanceKey({}),
				pageClientBuildEntries: [
					{
						integrationName: 'ecopages-jsx',
						dependency: {
							kind: 'script',
							source: 'file',
							filepath: path.join(rootDir, 'src/island.ts'),
							position: 'head',
						},
					},
				],
			},
		],
		bundledScripts: [pageScriptUnder(rootDir)],
	});
	const buildConfig = await createAppConfig(buildRoot);
	const builtAsset: ProcessedAsset = {
		filepath: path.join(buildConfig.absolutePaths.distDir, 'assets/client-page.js'),
		srcUrl: '/assets/client-page.js',
		kind: 'script',
	};
	writeFile(builtAsset.filepath!);
	await writeAppBrowserClientManifest(
		buildConfig,
		[createPlan(buildRoot)],
		[{ routeFile: path.join(buildRoot, 'pages/index.tsx') }],
		{
			sourceFiles: [],
			outputPaths: [],
			bundledScriptAssets: new Map([[getAssetDependencyKey(pageScriptUnder(buildRoot), buildRoot), builtAsset]]),
		},
	);
	renameSync(buildRoot, startRoot);
	const startConfig = await createAppConfig(startRoot);
	const renderer = {
		name: 'ecopages-jsx',
		buildGroupedGraphBuildPlan: vi.fn(async () => createPlan(startRoot)),
		prebuildProductionPageBrowserGraph: vi.fn(async () => {}),
	};

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(startConfig, {
			getPageRenderer: () => renderer as never,
		}),
		true,
	);

	const restored = requireAppRuntime(startConfig).prebuiltBrowserScripts.get(
		getAssetDependencyKey(pageScriptUnder(startRoot), startRoot),
	);
	assert.equal(restored?.filepath, path.join(startConfig.absolutePaths.distDir, 'assets/client-page.js'));
	assert.equal(restored?.srcUrl, '/assets/client-page.js');
});

test('prebuildProductionPageBrowserGraphsFromManifest restores Integration scripts and refreshes their assets', async () => {
	const appConfig = await createAppConfig();
	const globalScript: AssetDefinition = {
		kind: 'script',
		source: 'file',
		filepath: path.join(appConfig.rootDir, 'node_modules/lit-runtime/hydrate.ts'),
		position: 'head',
	};
	const runtimeScript: AssetDefinition = {
		kind: 'script',
		source: 'node-module',
		importPath: 'react',
		position: 'head',
		packageRole: 'runtime',
	};
	const globalAsset: ProcessedAsset = {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/client-hydrate.js'),
		srcUrl: '/assets/client-hydrate.js',
		kind: 'script',
	};
	writeFile(globalAsset.filepath!);
	await writeAppBrowserClientManifest(
		appConfig,
		[{ integrationName: 'lit', planKey: 'integration-scripts:lit', instances: [], bundledScripts: [globalScript] }],
		[],
		{
			sourceFiles: [],
			outputPaths: [],
			bundledScriptAssets: new Map([[getAssetDependencyKey(globalScript, appConfig.rootDir), globalAsset]]),
		},
	);
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const prebuiltWhenRefreshed: Array<ProcessedAsset | undefined> = [];
	const integration = {
		name: 'lit',
		getIntegrationDependencies: () => [{ ...globalScript }, runtimeScript],
		refreshResolvedIntegrationDependencies: vi.fn(async () => {
			prebuiltWhenRefreshed.push(
				requireAppRuntime(runtimeAppConfig).prebuiltBrowserScripts.get(
					getAssetDependencyKey(globalScript, appConfig.rootDir),
				),
			);
		}),
	};
	runtimeAppConfig.integrations.push(integration as never);

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, {
			getPageRenderer: () => {
				throw new Error('no routes');
			},
		}),
		true,
	);

	assert.equal(integration.refreshResolvedIntegrationDependencies.mock.calls.length, 1);
	assert.equal(prebuiltWhenRefreshed[0]?.srcUrl, '/assets/client-hydrate.js');
	assert.equal(requireAppRuntime(runtimeAppConfig).prebuiltBrowserScripts.size, 1);
});

test('prebuildProductionPageBrowserGraphsFromManifest restores dynamic route templates without static props', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/products/[slug].tsx');
	const plan: GroupedGraphBuildPlan = {
		integrationName: 'ecopages-jsx',
		planKey: 'dynamic-template-plan',
		instances: [
			{
				routeFile,
				dependencyInstanceKey: '',
				skipStaticProps: true,
				isRouteTemplate: true,
				contribution: { dependencies: [] },
				pageClientBuildEntries: [],
				prebuiltGroupedAssets: [],
				prebuiltPageClientBrowserAssets: {
					processedAssets: [],
					fallbackDependencies: [],
				},
			},
		],
	};
	await writeAppBrowserClientManifest(
		appConfig,
		[plan],
		[{ routeFile, skipStaticProps: true, isRouteTemplate: true }],
		{
			sourceFiles: [],
			outputPaths: [],
			bundledScriptAssets: new Map(),
		},
	);
	assert.equal(readAppBrowserClientManifest(appConfig)?.entries[0]?.skipStaticProps, true);
	assert.equal(readAppBrowserClientManifest(appConfig)?.entries[0]?.isRouteTemplate, true);

	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const renderer = {
		name: 'ecopages-jsx',
		buildGroupedGraphBuildPlan: vi.fn(
			async (
				_instances: Array<{
					routeFile: string;
					params?: Record<string, string | string[]>;
					skipStaticProps?: boolean;
					isRouteTemplate?: boolean;
				}>,
			) => plan,
		),
		prebuildProductionPageBrowserGraph: vi.fn(
			async (_routeFile: string, options: { skipStaticProps?: boolean; isRouteTemplate?: boolean }) => {
				assert.equal(options.skipStaticProps, true);
				assert.equal(options.isRouteTemplate, true);
			},
		),
	};

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, {
			getPageRenderer: () => renderer as never,
		}),
		true,
	);
	assert.deepEqual(renderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile, params: undefined, skipStaticProps: true, isRouteTemplate: true },
	]);
	assert.equal(renderer.prebuildProductionPageBrowserGraph.mock.calls.length, 1);
});

test('prebuildProductionPageBrowserGraphsFromManifest reuses outputs after HTML sources change', async () => {
	const appConfig = await createAppConfig();
	const htmlPageFile = path.join(appConfig.absolutePaths.pagesDir, 'docs.html');
	const htmlScriptFile = path.join(appConfig.absolutePaths.srcDir, 'document.ts');
	writeFile(htmlPageFile, '<script type="module" src="../document.ts"></script>');
	writeFile(htmlScriptFile, 'export const documentScript = true;');
	writeFile(path.join(appConfig.absolutePaths.distDir, 'assets/document.js'));
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map([[htmlScriptFile, '/assets/document.js']]));
	await writeAppBrowserClientManifest(appConfig, [], [], {
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map(),
	});
	writeFile(htmlScriptFile, 'export const documentScript = false;');
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, {
			getPageRenderer: () => null as never,
		}),
		true,
	);
});

test('prebuildProductionPageBrowserGraphsFromManifest reuses outputs after route sources change', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/index.tsx');
	const routeSource = path.join(appConfig.rootDir, 'src/page-client.ts');
	const routeOutput = path.join(appConfig.absolutePaths.distDir, 'assets/page-client.js');
	writeFile(routeSource, 'export const pageClient = true;');
	writeFile(routeOutput);
	const plan: GroupedGraphBuildPlan = {
		integrationName: 'ecopages-jsx',
		planKey: 'app-browser-build-plan',
		instances: [
			{
				routeFile,
				dependencyInstanceKey: createPageDependencyInstanceKey({}),
				pageClientBuildEntries: [],
				prebuiltGroupedAssets: [
					{
						filepath: routeOutput,
						sourceFilepath: routeSource,
						srcUrl: '/assets/page-client.js',
						kind: 'script',
					},
				],
			},
		],
	};
	await writeAppBrowserClientManifest(appConfig, [plan], [{ routeFile }], {
		sourceFiles: [routeSource],
		outputPaths: [routeOutput],
		bundledScriptAssets: new Map(),
	});
	writeFile(routeSource, 'export const pageClient = false;');
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const renderer = {
		name: 'ecopages-jsx',
		buildGroupedGraphBuildPlan: vi.fn(async () => plan),
		prebuildProductionPageBrowserGraph: vi.fn(async () => {}),
	};

	assert.equal(
		await prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, {
			getPageRenderer: () => renderer as never,
		}),
		true,
	);
});

test('restoreAppBrowserClientAssets rejects output files missing from dist', async () => {
	const appConfig = await createAppConfig();

	assert.throws(
		() => restoreAppBrowserClientAssets(appConfig, [{ kind: 'script', filepath: 'dist/client/assets/missing.js' }]),
		/missing output dist\/client\/assets\/missing\.js/,
	);
});

test('assertAppBrowserClientManifestHtmlOutputsExist rejects missing HTML script output', async () => {
	const appConfig = await createAppConfig();

	assert.throws(
		() =>
			assertAppBrowserClientManifestHtmlOutputsExist(appConfig, { 'src/pages/docs.html': '/assets/missing.js' }),
		/missing HTML module-script output for src\/pages\/docs\.html/,
	);
});

test('the app browser manifest records and validates shared build outputs', async () => {
	const appConfig = await createAppConfig();
	const sharedChunk = path.join(appConfig.absolutePaths.distDir, 'assets/shared-chunk.js');
	writeFile(sharedChunk);
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map());
	await writeAppBrowserClientManifest(appConfig, [], [], {
		sourceFiles: [],
		outputPaths: [sharedChunk],
		bundledScriptAssets: new Map(),
	});

	const manifest = readAppBrowserClientManifest(appConfig);
	assert.deepEqual(manifest?.browserOutputPaths, ['dist/client/assets/shared-chunk.js']);
	rmSync(sharedChunk);

	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	await expect(
		prebuildProductionPageBrowserGraphsFromManifest(runtimeAppConfig, { getPageRenderer: () => null as never }),
	).rejects.toThrow(/missing output dist\/client\/assets\/shared-chunk\.js/);
});

test('a manifest written by an earlier version asks for a new build', async () => {
	const appConfig = await createAppConfig();
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map());
	await writeAppBrowserClientManifest(appConfig, [], [], {
		sourceFiles: [],
		outputPaths: [],
		bundledScriptAssets: new Map(),
	});
	const manifestPath = path.join(getServerBundleOutputPaths(appConfig).serverOutdir, 'browser-client-manifest.json');
	writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, 'utf8')), version: 1 }));

	expect(() => readAppBrowserClientManifest(appConfig)).toThrow(/Run `ecopages build` again\./);
});
