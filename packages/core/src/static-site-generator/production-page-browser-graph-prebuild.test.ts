import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { getServerBundleOutputPaths } from '../build/server-bundle-deploy-manifest.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import type { AssetDefinition, ProcessedAsset } from '../assets/asset-processing-service/assets.types.ts';
import { AssetFactory } from '../assets/asset-processing-service/asset.factory.ts';
import { APP_BROWSER_CLIENT_BUNDLE_ID } from '../assets/asset-processing-service/app-browser-client-bundle.ts';
import { packagePageDependencies } from '../route-renderer/page-loading/page-dependency-bundling.ts';
import {
	PRODUCTION_ASSET_LEDGER_FILENAME,
	writeProductionAssetLedger,
	type ProductionAssetLedgerFile,
} from '../build/production-asset-ledger.ts';
import {
	getPrebuiltHtmlPageModuleScriptUrls,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	restoreProductionPageBrowserGraphs,
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

function ledgerPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getServerBundleOutputPaths(appConfig).serverOutdir, PRODUCTION_ASSET_LEDGER_FILENAME);
}

function readLedgerFile(appConfig: EcoPagesAppConfig): ProductionAssetLedgerFile {
	return JSON.parse(readFileSync(ledgerPath(appConfig), 'utf8')) as ProductionAssetLedgerFile;
}

/** Records `asset` as the app-wide build output of `dependency`, as `buildAppBrowserClient` does. */
function recordBuiltScript(appConfig: EcoPagesAppConfig, dependency: AssetDefinition, asset: ProcessedAsset): void {
	const ledger = requireAppRuntime(appConfig).processedAssets;
	ledger.record(dependency, asset);
	ledger.recordBrowserOutputs(asset.filepath ? [asset.filepath] : []);
	if (asset.filepath) writeFile(asset.filepath);
}

function createRestoringRenderer(plan: GroupedGraphBuildPlan) {
	return {
		name: plan.integrationName,
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
			async (_routeFile: string, _options?: { skipStaticProps?: boolean; isRouteTemplate?: boolean }) => {},
		),
	};
}

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	vi.stubEnv('NODE_ENV', 'production');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	vi.stubEnv('NODE_ENV', 'development');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates, sorts, and groups route instances by renderer', async () => {
	const calls: Array<{ rendererName: string; routeFile: string; params?: Record<string, string | string[]> }> = [];
	const appConfig = await createAppConfig();
	const reactRouteFile = path.join(appConfig.rootDir, 'pages/a/page.tsx');
	const litRouteFile = path.join(appConfig.rootDir, 'pages/b/page.tsx');
	const reactRouteParams = { slug: 'alpha' };
	const litRouteParams = { slug: 'beta' };
	const createBuildPlan = (integrationName: string, routeFile: string, params: Record<string, string>) => ({
		integrationName,
		instances: [{ routeFile, dependencyInstanceKey: createPageDependencyInstanceKey({ params }) }],
	});
	const reactGroupedBuildPlan = createBuildPlan('react', reactRouteFile, reactRouteParams);
	const litGroupedBuildPlan = createBuildPlan('lit', litRouteFile, litRouteParams);
	const createRenderer = (rendererName: string, groupedBuildPlan: GroupedGraphBuildPlan) => ({
		buildGroupedGraphBuildPlan: vi.fn(async (_instances: unknown[], _options: unknown) => groupedBuildPlan),
		prebuildProductionPageBrowserGraph: async (
			filePath: string,
			options?: { params?: Record<string, string | string[]> },
		) => {
			calls.push({ rendererName, routeFile: filePath, params: options?.params });
		},
	});
	const reactRenderer = createRenderer('react', reactGroupedBuildPlan);
	const litRenderer = createRenderer('lit', litGroupedBuildPlan);
	const routeRendererFactory = {
		getPageRenderer: (routeFile: string) => (routeFile === reactRouteFile ? reactRenderer : litRenderer) as never,
	};

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile: litRouteFile, params: litRouteParams },
			{ routeFile: reactRouteFile, params: reactRouteParams },
			{ routeFile: reactRouteFile, params: reactRouteParams },
		],
		routeRendererFactory,
	);

	assert.deepEqual(buildAppBrowserClientMock.mock.calls, [[appConfig, [reactGroupedBuildPlan, litGroupedBuildPlan]]]);
	assert.deepEqual(reactRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: reactRouteFile, params: reactRouteParams },
	]);
	assert.deepEqual(litRenderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: litRouteFile, params: litRouteParams },
	]);
	assert.deepEqual(calls, [
		{ rendererName: 'react', routeFile: reactRouteFile, params: reactRouteParams },
		{ rendererName: 'lit', routeFile: litRouteFile, params: litRouteParams },
	]);
	assert.deepEqual(readLedgerFile(appConfig).plannedRoutes, [
		{ routeFile: 'pages/a/page.tsx', params: reactRouteParams },
		{ routeFile: 'pages/b/page.tsx', params: litRouteParams },
	]);
	assert.equal(existsSync(path.join(path.dirname(ledgerPath(appConfig)), 'browser-client-manifest.json')), false);
});

test('prebuildProductionPageBrowserGraphs skips routes whose preparation failed', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/[slug].tsx');
	const failure = new Error('broken static props');
	const groupedBuildPlan = {
		integrationName: 'react',
		instances: [
			{ routeFile, dependencyInstanceKey: createPageDependencyInstanceKey({ params: { slug: 'healthy' } }) },
		],
	};
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

	await prebuildProductionPageBrowserGraphs(
		appConfig,
		[
			{ routeFile, params: { slug: 'broken' } },
			{ routeFile, params: { slug: 'healthy' } },
		],
		{ getPageRenderer: () => renderer as never },
	);

	assert.deepEqual(prebuiltRoutes, [routeFile]);
	assert.deepEqual(buildAppBrowserClientMock.mock.calls[0]?.[1], [groupedBuildPlan]);
	assert.deepEqual(readLedgerFile(appConfig).plannedRoutes, [
		{ routeFile: 'pages/[slug].tsx', params: { slug: 'healthy' } },
	]);
});

test('clearProductionPageBrowserGraphSession clears production session records and the ledger file', async () => {
	const appConfig = await createAppConfig();
	const runtime = requireAppRuntime(appConfig);
	runtime.productionBrowserGraphsSealed = true;
	runtime.plannedProductionRoutes = [{ routeFile: path.join(appConfig.rootDir, 'pages/index.tsx') }];
	runtime.processedAssets.recordBrowserOutputs([path.join(appConfig.absolutePaths.distDir, 'assets/old.js')]);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const clearSpy = vi.spyOn(runtime.pageBrowserGraphSession, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
	assert.equal(runtime.productionBrowserGraphsSealed, false);
	assert.deepEqual(runtime.plannedProductionRoutes, []);
	assert.equal(runtime.processedAssets.hasBrowserBuild, false);
	assert.equal(existsSync(ledgerPath(appConfig)), false);
});

test('restoreProductionPageBrowserGraphs restores the asset ledger and HTML module scripts for SSR start', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/[slug].tsx');
	const params = { slug: 'intro' };
	const island: AssetDefinition = {
		kind: 'script',
		source: 'content',
		content: 'import "./island.ts";',
		position: 'head',
	};
	const islandAsset: ProcessedAsset = {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/island.js'),
		srcUrl: '/assets/island.js',
		kind: 'script',
	};
	const htmlPageFile = path.join(appConfig.absolutePaths.pagesDir, 'docs.html');
	const htmlScriptFile = path.join(appConfig.absolutePaths.srcDir, 'document.ts');
	writeFile(htmlPageFile, '<script type="module" src="../document.ts"></script>');
	writeFile(htmlScriptFile, 'export const documentScript = true;');
	writeFile(path.join(appConfig.absolutePaths.distDir, 'assets/document.js'));
	recordBuiltScript(appConfig, island, islandAsset);
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map([[htmlScriptFile, '/assets/document.js']]));
	requireAppRuntime(appConfig).plannedProductionRoutes = [{ routeFile, params }];
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const renderer = createRestoringRenderer({ integrationName: 'ecopages-jsx', instances: [] });

	assert.deepEqual(await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig), new Map());
	assert.equal(
		await restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => renderer as never }),
		true,
	);

	const runtime = requireAppRuntime(runtimeAppConfig);
	assert.equal(runtime.productionBrowserGraphsSealed, true);
	assert.equal(buildAppBrowserClientMock.mock.calls.length, 0);
	assert.deepEqual(
		await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig),
		new Map([[htmlScriptFile, '/assets/document.js']]),
	);
	assert.equal(runtime.processedAssets.lookup(island)?.filepath, islandAsset.filepath);
	assert.deepEqual(renderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [{ routeFile, params }]);
	assert.equal(renderer.prebuildProductionPageBrowserGraph.mock.calls.length, 1);
});

test('restoreProductionPageBrowserGraphs fails when a planned component script is not in the ledger', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/index.tsx');
	requireAppRuntime(appConfig).plannedProductionRoutes = [{ routeFile }];
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const renderer = createRestoringRenderer({
		integrationName: 'ecopages-jsx',
		instances: [],
		bundledScripts: [
			{ kind: 'script', source: 'file', filepath: path.join(appConfig.rootDir, 'src/new.script.ts') },
		],
	});

	await expect(
		restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => renderer as never }),
	).rejects.toThrow(
		'The production asset ledger does not record the ecopages-jsx script src/new.script.ts. Run `ecopages build` again.',
	);
});

test('restoreProductionPageBrowserGraphs restores a non-React build moved to another folder', async () => {
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
	const islandUnder = (rootDir: string): AssetDefinition => ({
		kind: 'script',
		source: 'file',
		filepath: path.join(rootDir, 'src/island.ts'),
		position: 'head',
	});
	const buildConfig = await createAppConfig(buildRoot);
	recordBuiltScript(buildConfig, pageScriptUnder(buildRoot), {
		filepath: path.join(buildConfig.absolutePaths.distDir, 'assets/client-page.js'),
		srcUrl: '/assets/client-page.js',
		kind: 'script',
	});
	recordBuiltScript(buildConfig, islandUnder(buildRoot), {
		filepath: path.join(buildConfig.absolutePaths.distDir, 'assets/client-island.js'),
		srcUrl: '/assets/client-island.js',
		kind: 'script',
	});
	requireAppRuntime(buildConfig).plannedProductionRoutes = [{ routeFile: path.join(buildRoot, 'pages/index.tsx') }];
	writeFile(path.join(buildConfig.absolutePaths.distDir, 'assets/document.js'));
	writeProductionAssetLedger(
		buildConfig,
		new Map([[path.join(buildRoot, 'src/document.ts'), '/assets/document.js']]),
	);
	assert.doesNotMatch(readFileSync(ledgerPath(buildConfig), 'utf8'), /built-here|\\\\/);
	renameSync(buildRoot, startRoot);
	const startConfig = await createAppConfig(startRoot);
	const renderer = createRestoringRenderer({
		integrationName: 'ecopages-jsx',
		instances: [],
		bundledScripts: [pageScriptUnder(startRoot)],
	});

	assert.equal(
		await restoreProductionPageBrowserGraphs(startConfig, { getPageRenderer: () => renderer as never }),
		true,
	);

	const ledger = requireAppRuntime(startConfig).processedAssets;
	const restored = ledger.lookup(pageScriptUnder(startRoot));
	assert.equal(restored?.filepath, path.join(startConfig.absolutePaths.distDir, 'assets/client-page.js'));
	assert.equal(restored?.srcUrl, '/assets/client-page.js');
	assert.equal(ledger.lookup(islandUnder(startRoot))?.srcUrl, '/assets/client-island.js');
	assert.deepEqual(
		await getPrebuiltHtmlPageModuleScriptUrls(startConfig),
		new Map([[path.join(startRoot, 'src/document.ts'), '/assets/document.js']]),
	);
	assert.deepEqual(renderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile: path.join(startRoot, 'pages/index.tsx') },
	]);
});

test('restoreProductionPageBrowserGraphs restores Integration scripts before refreshing their assets', async () => {
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
	recordBuiltScript(appConfig, globalScript, {
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/client-hydrate.js'),
		srcUrl: '/assets/client-hydrate.js',
		kind: 'script',
	});
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const recordedWhenRefreshed: Array<ProcessedAsset | undefined> = [];
	const integration = {
		name: 'lit',
		getIntegrationDependencies: () => [{ ...globalScript }, runtimeScript],
		refreshResolvedIntegrationDependencies: vi.fn(async () => {
			recordedWhenRefreshed.push(requireAppRuntime(runtimeAppConfig).processedAssets.lookup(globalScript));
		}),
	};
	runtimeAppConfig.integrations.push(integration as never);

	assert.equal(
		await restoreProductionPageBrowserGraphs(runtimeAppConfig, {
			getPageRenderer: () => {
				throw new Error('no routes');
			},
		}),
		true,
	);

	assert.equal(integration.refreshResolvedIntegrationDependencies.mock.calls.length, 1);
	assert.equal(recordedWhenRefreshed[0]?.srcUrl, '/assets/client-hydrate.js');
});

test('restoreProductionPageBrowserGraphs plans dynamic route templates again without static props', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/products/[slug].tsx');
	requireAppRuntime(appConfig).plannedProductionRoutes = [
		{ routeFile, skipStaticProps: true, isRouteTemplate: true },
	];
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);
	const renderer = createRestoringRenderer({ integrationName: 'ecopages-jsx', instances: [] });

	assert.equal(
		await restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => renderer as never }),
		true,
	);
	assert.deepEqual(renderer.buildGroupedGraphBuildPlan.mock.calls[0]?.[0], [
		{ routeFile, skipStaticProps: true, isRouteTemplate: true },
	]);
	assert.deepEqual(renderer.prebuildProductionPageBrowserGraph.mock.calls[0], [
		routeFile,
		{ params: undefined, skipStaticProps: true, isRouteTemplate: true },
	]);
});

test('restoreProductionPageBrowserGraphs reuses outputs after HTML sources change', async () => {
	const appConfig = await createAppConfig();
	const htmlPageFile = path.join(appConfig.absolutePaths.pagesDir, 'docs.html');
	const htmlScriptFile = path.join(appConfig.absolutePaths.srcDir, 'document.ts');
	writeFile(htmlPageFile, '<script type="module" src="../document.ts"></script>');
	writeFile(htmlScriptFile, 'export const documentScript = true;');
	writeFile(path.join(appConfig.absolutePaths.distDir, 'assets/document.js'));
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, new Map([[htmlScriptFile, '/assets/document.js']]));
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	writeFile(htmlScriptFile, 'export const documentScript = false;');
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	assert.equal(
		await restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => null as never }),
		true,
	);
});

test('restoreProductionPageBrowserGraphs rejects a missing HTML module-script output', async () => {
	const appConfig = await createAppConfig();
	setPrebuiltHtmlPageModuleScriptUrls(
		appConfig,
		new Map([[path.join(appConfig.absolutePaths.srcDir, 'document.ts'), '/assets/missing.js']]),
	);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(
		restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => null as never }),
	).rejects.toThrow(/missing output dist\/client\/assets\/missing\.js/);
});

test('restoreProductionPageBrowserGraphs rejects a missing shared chunk of the app-wide build', async () => {
	const appConfig = await createAppConfig();
	const sharedChunk = path.join(appConfig.absolutePaths.distDir, 'assets/shared-chunk.js');
	writeFile(sharedChunk);
	requireAppRuntime(appConfig).processedAssets.recordBrowserOutputs([sharedChunk]);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	assert.deepEqual(readLedgerFile(appConfig).browserOutputs, ['dist/client/assets/shared-chunk.js']);
	rmSync(sharedChunk);
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(
		restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => null as never }),
	).rejects.toThrow(/missing output dist\/client\/assets\/shared-chunk\.js/);
});

test('a ledger file written by an earlier version asks for a new build', async () => {
	const appConfig = await createAppConfig();
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	writeFileSync(ledgerPath(appConfig), JSON.stringify({ ...readLedgerFile(appConfig), version: 1 }));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(
		restoreProductionPageBrowserGraphs(runtimeAppConfig, { getPageRenderer: () => null as never }),
	).rejects.toThrow(/Run `ecopages build` again\./);
});
