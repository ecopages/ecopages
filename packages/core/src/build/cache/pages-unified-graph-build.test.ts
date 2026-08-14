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
	isPagesUnifiedGraphEnabled,
	isPagesUnifiedGraphPage,
	PAGES_UNIFIED_GRAPH_CACHE_FILENAME,
	shouldBuildPagesUnifiedGraph,
} from './pages-unified-graph-build.ts';
import {
	getPageModuleRolldownBuildInvocations,
	getTotalRolldownBuildInvocations,
	resetRolldownBuildInvocationCounts,
} from '../rolldown/rolldown-build-invocation-metrics.ts';
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
});
