import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { getServerBundleOutputPaths } from '../build/server-bundle-deploy-manifest.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import type { PlannedRouteInstance } from '../route-renderer/orchestration/integration-renderer.ts';
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
	restoreProductionBrowserBuild,
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

/** A renderer whose routes plan to `plan`; preparing them appends `event(routeFile)` to `events`. */
function createPlanningRenderer(plan: GroupedGraphBuildPlan, events: string[] = []) {
	return {
		planProductionRoutes: vi.fn(async (instances: PlannedRouteInstance[], _options?: unknown) => ({
			plan,
			prepare: async () => {
				for (const { routeFile } of instances) events.push(`prepare ${path.basename(path.dirname(routeFile))}`);
			},
			preparations: [],
		})),
	};
}

function createPlan(integrationName: string): GroupedGraphBuildPlan {
	return { integrationName, bundledScripts: [], pageClientEntries: [] };
}

test('shouldPrebuildProductionPageBrowserGraphs is production-only', () => {
	vi.stubEnv('NODE_ENV', 'production');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), true);

	vi.stubEnv('NODE_ENV', 'development');
	assert.equal(shouldPrebuildProductionPageBrowserGraphs(), false);
});

test('prebuildProductionPageBrowserGraphs deduplicates, sorts, and groups route instances by renderer', async () => {
	const appConfig = await createAppConfig();
	const reactRouteFile = path.join(appConfig.rootDir, 'pages/a/page.tsx');
	const litRouteFile = path.join(appConfig.rootDir, 'pages/b/page.tsx');
	const reactRouteParams = { slug: 'alpha' };
	const litRouteParams = { slug: 'beta' };
	const events: string[] = [];
	buildAppBrowserClientMock.mockImplementation(async () => {
		events.push('build');
	});
	const reactPlan = createPlan('react');
	const litPlan = createPlan('lit');
	const reactRenderer = createPlanningRenderer(reactPlan, events);
	const litRenderer = createPlanningRenderer(litPlan, events);
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

	assert.deepEqual(buildAppBrowserClientMock.mock.calls, [[appConfig, [reactPlan, litPlan]]]);
	assert.deepEqual(reactRenderer.planProductionRoutes.mock.calls[0]?.[0], [
		{ routeFile: reactRouteFile, params: reactRouteParams },
	]);
	assert.deepEqual(litRenderer.planProductionRoutes.mock.calls[0]?.[0], [
		{ routeFile: litRouteFile, params: litRouteParams },
	]);
	assert.deepEqual(events, ['build', 'prepare a', 'prepare b']);
	assert.equal(existsSync(path.join(path.dirname(ledgerPath(appConfig)), 'browser-client-manifest.json')), false);
});

test('prebuildProductionPageBrowserGraphs writes the ledger once every planned route is prepared', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/index/page.tsx');
	const preparedAsset: ProcessedAsset = {
		kind: 'stylesheet',
		filepath: path.join(appConfig.absolutePaths.distDir, 'assets/page.css'),
	};
	const stylesheet: AssetDefinition = {
		kind: 'stylesheet',
		source: 'file',
		filepath: path.join(appConfig.rootDir, 'src/page.css'),
	};
	const ledgerExistedWhenPrepared: boolean[] = [];
	const renderer = {
		planProductionRoutes: vi.fn(async () => ({
			plan: createPlan('react'),
			prepare: async () => {
				ledgerExistedWhenPrepared.push(existsSync(ledgerPath(appConfig)));
				requireAppRuntime(appConfig).processedAssets.record(stylesheet, preparedAsset);
			},
			preparations: [],
		})),
	};

	await prebuildProductionPageBrowserGraphs(appConfig, [{ routeFile }], { getPageRenderer: () => renderer as never });

	const ledger = readLedgerFile(appConfig);
	assert.deepEqual(ledgerExistedWhenPrepared, [false]);
	assert.equal(ledger.version, 3);
	assert.equal('plannedRoutes' in ledger, false);
	assert.ok(ledger.entries.some((entry) => entry.asset.filepath === 'dist/client/assets/page.css'));
});

test('prebuildProductionPageBrowserGraphs builds nothing when no route could be planned', async () => {
	const appConfig = await createAppConfig();
	const routeFile = path.join(appConfig.rootDir, 'pages/[slug].tsx');
	const renderer = { planProductionRoutes: vi.fn(async () => undefined) };

	await prebuildProductionPageBrowserGraphs(appConfig, [{ routeFile, params: { slug: 'broken' } }], {
		getPageRenderer: () => renderer as never,
	});

	assert.equal(renderer.planProductionRoutes.mock.calls.length, 1);
	assert.equal(buildAppBrowserClientMock.mock.calls.length, 0);
	assert.equal(existsSync(ledgerPath(appConfig)), false);
});

test('clearProductionPageBrowserGraphSession clears production session records and the ledger file', async () => {
	const appConfig = await createAppConfig();
	const runtime = requireAppRuntime(appConfig);
	runtime.processedAssets.recordBrowserOutputs([path.join(appConfig.absolutePaths.distDir, 'assets/old.js')]);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const clearSpy = vi.spyOn(runtime.pageBrowserGraphSession, 'clearPolicyRecords');

	clearProductionPageBrowserGraphSession(appConfig);

	assert.equal(clearSpy.mock.calls.length, 1);
	assert.equal(clearSpy.mock.calls[0]?.[0], 'production');
	assert.equal(runtime.processedAssets.hasBrowserBuild, false);
	assert.equal(existsSync(ledgerPath(appConfig)), false);
});

test('restoreProductionBrowserBuild restores and seals the asset ledger and HTML module scripts for start', async () => {
	const appConfig = await createAppConfig();
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
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	assert.deepEqual(await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig), new Map());
	assert.equal(await restoreProductionBrowserBuild(runtimeAppConfig, { seal: true }), true);

	const runtime = requireAppRuntime(runtimeAppConfig);
	assert.equal(runtime.processedAssets.isSealed, true);
	assert.equal(buildAppBrowserClientMock.mock.calls.length, 0);
	assert.deepEqual(
		await getPrebuiltHtmlPageModuleScriptUrls(runtimeAppConfig),
		new Map([[htmlScriptFile, '/assets/document.js']]),
	);
	assert.equal(runtime.processedAssets.lookup(island)?.filepath, islandAsset.filepath);
});

test('restoreProductionBrowserBuild leaves the ledger open for the Lit static-render worker', async () => {
	const appConfig = await createAppConfig();
	writeProductionAssetLedger(appConfig, new Map());
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	assert.equal(await restoreProductionBrowserBuild(runtimeAppConfig, { seal: false }), true);
	assert.equal(requireAppRuntime(runtimeAppConfig).processedAssets.isSealed, false);
});

test('restoreProductionBrowserBuild restores a non-React build moved to another folder', async () => {
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
	writeFile(path.join(buildConfig.absolutePaths.distDir, 'assets/document.js'));
	writeProductionAssetLedger(
		buildConfig,
		new Map([[path.join(buildRoot, 'src/document.ts'), '/assets/document.js']]),
	);
	assert.doesNotMatch(readFileSync(ledgerPath(buildConfig), 'utf8'), /built-here|\\\\/);
	renameSync(buildRoot, startRoot);
	const startConfig = await createAppConfig(startRoot);

	assert.equal(await restoreProductionBrowserBuild(startConfig, { seal: true }), true);

	const ledger = requireAppRuntime(startConfig).processedAssets;
	const restored = ledger.lookup(pageScriptUnder(startRoot));
	assert.equal(restored?.filepath, path.join(startConfig.absolutePaths.distDir, 'assets/client-page.js'));
	assert.equal(restored?.srcUrl, '/assets/client-page.js');
	assert.equal(ledger.lookup(islandUnder(startRoot))?.srcUrl, '/assets/client-island.js');
	assert.deepEqual(
		await getPrebuiltHtmlPageModuleScriptUrls(startConfig),
		new Map([[path.join(startRoot, 'src/document.ts'), '/assets/document.js']]),
	);
});

test('restoreProductionBrowserBuild restores Integration scripts before refreshing their assets', async () => {
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

	assert.equal(await restoreProductionBrowserBuild(runtimeAppConfig, { seal: true }), true);

	assert.equal(integration.refreshResolvedIntegrationDependencies.mock.calls.length, 1);
	assert.equal(recordedWhenRefreshed[0]?.srcUrl, '/assets/client-hydrate.js');
});

test('restoreProductionBrowserBuild reuses outputs after HTML sources change', async () => {
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

	assert.equal(await restoreProductionBrowserBuild(runtimeAppConfig, { seal: true }), true);
});

test('restoreProductionBrowserBuild rejects a missing HTML module-script output', async () => {
	const appConfig = await createAppConfig();
	setPrebuiltHtmlPageModuleScriptUrls(
		appConfig,
		new Map([[path.join(appConfig.absolutePaths.srcDir, 'document.ts'), '/assets/missing.js']]),
	);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(restoreProductionBrowserBuild(runtimeAppConfig, { seal: true })).rejects.toThrow(
		/missing output dist\/client\/assets\/missing\.js/,
	);
});

test('restoreProductionBrowserBuild rejects a missing shared chunk of the app-wide build', async () => {
	const appConfig = await createAppConfig();
	const sharedChunk = path.join(appConfig.absolutePaths.distDir, 'assets/shared-chunk.js');
	writeFile(sharedChunk);
	requireAppRuntime(appConfig).processedAssets.recordBrowserOutputs([sharedChunk]);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	assert.deepEqual(readLedgerFile(appConfig).browserOutputs, ['dist/client/assets/shared-chunk.js']);
	rmSync(sharedChunk);
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(restoreProductionBrowserBuild(runtimeAppConfig, { seal: true })).rejects.toThrow(
		/missing output dist\/client\/assets\/shared-chunk\.js/,
	);
});

test('a ledger file written by an earlier version asks for a new build', async () => {
	const appConfig = await createAppConfig();
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	writeFileSync(ledgerPath(appConfig), JSON.stringify({ ...readLedgerFile(appConfig), version: 1 }));
	const runtimeAppConfig = await createAppConfig(appConfig.rootDir);

	await expect(restoreProductionBrowserBuild(runtimeAppConfig, { seal: true })).rejects.toThrow(
		/Run `ecopages build` again\./,
	);
});

test('restoreProductionBrowserBuild asks for a new build when dist has only a browser client manifest', async () => {
	const appConfig = await createAppConfig();
	writeFile(path.join(path.dirname(ledgerPath(appConfig)), 'browser-client-manifest.json'), '{"version":2}');

	await expect(restoreProductionBrowserBuild(appConfig, { seal: true })).rejects.toThrow(
		/Run `ecopages build` again\./,
	);
});
