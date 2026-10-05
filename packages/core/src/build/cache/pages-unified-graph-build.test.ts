import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import { installBuildRuntime } from '../runtime/build-runtime.ts';
import { createAppModuleLoader } from '../../services/module-loading/app-server-module-transpiler.service.ts';
import { PageModuleImportService } from '../../services/module-loading/page-module-import.service.ts';
import {
	ensurePagesUnifiedGraphBuilt,
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphEnabled,
	isPagesUnifiedGraphPage,
	PAGES_UNIFIED_GRAPH_CACHE_DIR,
	PAGES_UNIFIED_GRAPH_CACHE_FILENAME,
	shouldBuildPagesUnifiedGraph,
} from './pages-unified-graph-build.ts';
import {
	getPageModuleRolldownBuildInvocations,
	getTotalRolldownBuildInvocations,
	resetRolldownBuildInvocationCounts,
} from '../rolldown/rolldown-build-invocation-metrics.ts';
import { collectReachableLocalImports } from './output-imports.ts';
import { getServerModuleBuildCacheOutdir } from '../../services/module-loading/route-module-build-cache-registry.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';

describe('pages-unified-graph-build', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalUnifiedGraph = process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
	const originalMetrics = process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		if (originalUnifiedGraph === undefined) {
			delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
		} else {
			process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = originalUnifiedGraph;
		}
		if (originalMetrics === undefined) {
			delete process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;
		} else {
			process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = originalMetrics;
		}
		resetRolldownBuildInvocationCounts();
	});

	it('identifies configured template extensions as unified-graph eligible', async () => {
		const appConfig = await createFixtureAppConfig();

		assert.equal(
			isPagesUnifiedGraphPage(path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts'), appConfig),
			true,
		);
		assert.equal(
			isPagesUnifiedGraphPage(path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.kita.tsx'), appConfig),
			false,
		);
	});

	it('leaves out Pages of any Integration that compiles its own modules', async () => {
		const appConfig = await createFixtureAppConfig();
		const pagesDir = appConfig.absolutePaths.pagesDir;
		const withTemplates = {
			...appConfig,
			integrations: [
				...appConfig.integrations,
				{ name: 'templates', extensions: ['.tpl'], compilePageModule: () => ({ default: () => '' }) },
			],
		} as unknown as typeof appConfig;

		assert.equal(appConfig.templatesExt.includes('.html'), true);
		assert.equal(isPagesUnifiedGraphPage(path.join(pagesDir, 'about.html'), appConfig), false);
		assert.equal(isPagesUnifiedGraphPage(path.join(pagesDir, 'about.tpl'), withTemplates), false);
		assert.equal(isPagesUnifiedGraphPage(path.join(pagesDir, 'index.ts'), withTemplates), true);
	});

	it('defaults unified graph on in production unless explicitly disabled', () => {
		process.env.NODE_ENV = 'production';
		delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
		assert.equal(isPagesUnifiedGraphEnabled(), true);
		assert.equal(shouldBuildPagesUnifiedGraph(), true);

		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '0';
		assert.equal(isPagesUnifiedGraphEnabled(), false);
		assert.equal(shouldBuildPagesUnifiedGraph(), false);

		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		assert.equal(isPagesUnifiedGraphEnabled(), true);
		assert.equal(shouldBuildPagesUnifiedGraph(), true);

		process.env.NODE_ENV = 'development';
		assert.equal(isPagesUnifiedGraphEnabled(), true);
		assert.equal(shouldBuildPagesUnifiedGraph(), false);
	});

	it('builds all string pages in one Rolldown invocation and reuses the graph manifest', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const entryPaths = [
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/404.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/postcss-hmr.ts'),
		];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);

		resetRolldownBuildInvocationCounts();
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});

		assert.ok(manifest);
		assert.equal(Object.keys(manifest.outputs).length, entryPaths.length);
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		const manifestPath = path.join(
			resolveInternalExecutionDir(appConfig),
			'.server-pages-graph',
			PAGES_UNIFIED_GRAPH_CACHE_FILENAME,
		);
		assert.equal(fileSystem.exists(manifestPath), true);

		resetRolldownBuildInvocationCounts();
		const reused = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
		});

		assert.ok(reused);
		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});

	it('imports prebuilt graph modules without per-page Rolldown during static export', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const entryPaths = [
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/404.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/postcss-hmr.ts'),
		];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		const appModuleLoader = createAppModuleLoader(appConfig);
		resetRolldownBuildInvocationCounts();

		for (const entryPath of entryPaths) {
			const module = await appModuleLoader.importModule<{ default: unknown }>({
				filePath: entryPath,
				rootDir: appConfig.rootDir,
				outdir,
			});
			assert.ok(module.default);
		}

		assert.equal(getPageModuleRolldownBuildInvocations(), 0);

		const directImportService = new PageModuleImportService(appConfig);
		for (const entryPath of entryPaths) {
			await directImportService.importModule({
				filePath: entryPath,
				rootDir: appConfig.rootDir,
				outdir,
			});
		}

		assert.equal(getPageModuleRolldownBuildInvocations(), 0);
	});

	it('does not import graph modules from a stale or incomplete manifest', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);
		const entryPath = path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts');
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		await ensurePagesUnifiedGraphBuilt({ appConfig, entryPaths: [entryPath], outdir, force: true });
		assert.ok(await importPagesUnifiedGraphModule(appConfig, entryPath));

		const manifestPath = path.join(
			resolveInternalExecutionDir(appConfig),
			PAGES_UNIFIED_GRAPH_CACHE_DIR,
			PAGES_UNIFIED_GRAPH_CACHE_FILENAME,
		);
		const manifest = JSON.parse(fileSystem.readFileSync(manifestPath));
		const rewrite = (overrides: Record<string, unknown>) =>
			fileSystem.write(manifestPath, JSON.stringify({ ...manifest, ...overrides }));

		rewrite({ builtAt: manifest.builtAt + 1, outputImports: [path.join(outdir, 'missing-chunk.js')] });
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);

		rewrite({ builtAt: manifest.builtAt + 2, corePackageVersion: 'stale' });
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);

		rewrite({ builtAt: manifest.builtAt + 3, outputImports: undefined });
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);

		rewrite({ builtAt: manifest.builtAt + 4, dependencyHashes: undefined });
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);
	});

	it('records nested local imports so a deleted shared chunk invalidates the graph', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);
		const entryPaths = [
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/404.ts'),
			path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/postcss-hmr.ts'),
		];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});
		assert.ok(manifest);

		const recorded = new Set(manifest.outputImports);
		for (const outputPath of Object.values(manifest.outputs)) {
			for (const reachable of collectReachableLocalImports(outputPath)) {
				assert.equal(recorded.has(reachable), true, `missing reachable import ${reachable}`);
			}
		}

		const nestedImport = manifest.outputImports.find(
			(importPath) => !Object.values(manifest.outputs).includes(importPath),
		);
		if (nestedImport) {
			fileSystem.remove(nestedImport);
			assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPaths[0]), undefined);
		}
	});

	it('rebuilds the graph when template extensions change', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const entryPaths = [path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts')];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		appConfig.templatesExt = [...appConfig.templatesExt, '.extra.tsx'];

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
		});

		assert.equal(getTotalRolldownBuildInvocations(), 1);
	});

	it.each([
		{ layoutPlacement: 'in the entry chunk', pages: ['index.ts'] },
		{ layoutPlacement: 'in a chunk shared by several pages', pages: ['index.ts', '404.ts'] },
	])('rebuilds the graph when a layout $layoutPlacement changes', async ({ pages }) => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const entryPaths = pages.map((page) => path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages', page));
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const layoutPath = path.join(FIXTURE_APP_PROJECT_DIR, 'src/layouts/base-layout/base-layout.ts');
		const originalLayout = fileSystem.readFileSync(layoutPath);

		resetRolldownBuildInvocationCounts();
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});
		assert.ok(manifest);
		assert.ok(
			Object.keys(manifest.dependencyHashes).some((filePath) => filePath.endsWith('base-layout.ts')),
			'graph records the layout source hash',
		);
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		try {
			fileSystem.write(layoutPath, `${originalLayout}\nexport const cacheBust = 1;\n`);
			resetRolldownBuildInvocationCounts();
			await ensurePagesUnifiedGraphBuilt({
				appConfig,
				entryPaths,
				outdir,
			});
			assert.equal(getTotalRolldownBuildInvocations(), 1);
		} finally {
			fileSystem.write(layoutPath, originalLayout);
		}
	});

	it('rebuilds the graph and rejects module import when a reachable source file is deleted', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const entryPaths = [path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts')];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const layoutPath = path.join(FIXTURE_APP_PROJECT_DIR, 'src/layouts/base-layout/base-layout.ts');
		const helperPath = path.join(FIXTURE_APP_PROJECT_DIR, 'src/layouts/base-layout/temp-helper.ts');
		const originalLayout = fileSystem.readFileSync(layoutPath);

		try {
			fileSystem.write(helperPath, 'export const tempHelper = "temp-value";\n');
			fileSystem.write(
				layoutPath,
				`import { eco } from '@ecopages/core';\nimport { tempHelper } from './temp-helper.ts';\n\nexport const BaseLayout = eco.component<{ children?: string }>({\n\trender: ({ children }) => \`<body>\${children} \${tempHelper}</body>\`,\n});\n`,
			);

			resetRolldownBuildInvocationCounts();
			const manifest = await ensurePagesUnifiedGraphBuilt({
				appConfig,
				entryPaths,
				outdir,
				force: true,
			});
			assert.ok(manifest);
			assert.ok(
				Object.keys(manifest.dependencyHashes).some((filePath) => filePath.endsWith('temp-helper.ts')),
				'graph records the imported helper source hash',
			);
			assert.equal(getTotalRolldownBuildInvocations(), 1);

			fileSystem.remove(helperPath);
			fileSystem.write(layoutPath, originalLayout);

			assert.equal(
				await importPagesUnifiedGraphModule(appConfig, entryPaths[0]),
				undefined,
				'rejects stale graph import when dependency source is deleted',
			);

			resetRolldownBuildInvocationCounts();
			const rebuiltManifest = await ensurePagesUnifiedGraphBuilt({
				appConfig,
				entryPaths,
				outdir,
			});
			assert.ok(rebuiltManifest);
			assert.equal(getTotalRolldownBuildInvocations(), 1);
			assert.equal(
				Object.keys(rebuiltManifest.dependencyHashes).some((filePath) => filePath.endsWith('temp-helper.ts')),
				false,
				'rebuilt manifest no longer references the deleted helper',
			);
		} finally {
			if (fileSystem.exists(helperPath)) {
				fileSystem.remove(helperPath);
			}
			fileSystem.write(layoutPath, originalLayout);
		}
	});

	it('invalidates cache when route entries are added or removed (exact route set match)', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const indexEntry = path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts');
		const notFoundEntry = path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/404.ts');
		const outdir = getServerModuleBuildCacheOutdir(appConfig);

		resetRolldownBuildInvocationCounts();
		const manifestTwoEntries = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, notFoundEntry],
			outdir,
			force: true,
		});
		assert.ok(manifestTwoEntries);
		assert.equal(Object.keys(manifestTwoEntries.outputs).length, 2);
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		resetRolldownBuildInvocationCounts();
		const manifestOneEntry = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry],
			outdir,
		});
		assert.ok(manifestOneEntry);
		assert.equal(Object.keys(manifestOneEntry.outputs).length, 1);
		assert.equal(getTotalRolldownBuildInvocations(), 1, 'rebuilds when an entry is removed from active routes');

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry],
			outdir,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 0, 'reuses cache when entry set is identical');

		resetRolldownBuildInvocationCounts();
		const manifestRestored = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, notFoundEntry],
			outdir,
		});
		assert.ok(manifestRestored);
		assert.equal(Object.keys(manifestRestored.outputs).length, 2);
		assert.equal(getTotalRolldownBuildInvocations(), 1, 'rebuilds when an entry is re-added');
	});

	it('deduplicates duplicate entry paths caused by dynamic routes', async () => {
		process.env.NODE_ENV = 'production';
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '1';
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';

		const appConfig = await createFixtureAppConfig();
		installBuildRuntime(appConfig);

		const indexEntry = path.join(FIXTURE_APP_PROJECT_DIR, 'src/pages/index.ts');
		const outdir = getServerModuleBuildCacheOutdir(appConfig);

		resetRolldownBuildInvocationCounts();
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, indexEntry, indexEntry],
			outdir,
			force: true,
		});
		assert.ok(manifest);
		assert.equal(Object.keys(manifest.outputs).length, 1);
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, indexEntry],
			outdir,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 0, 'reuses cache despite duplicate entry references');
	});
});
