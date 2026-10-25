import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.ts';
import { copyFixtureApp } from '../../../__fixtures__/app/copy-fixture-app.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import { AppModuleLoader } from '../server/app-module-loader.service.ts';
import { PageModuleImportService } from '../server/page-module-import.service.ts';
import {
	emitProductionServerModules,
	ensurePagesUnifiedGraphBuilt,
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphPage,
	shouldBuildPagesUnifiedGraph,
} from './pages-unified-graph-build.ts';
import {
	getPageModuleRolldownBuildInvocations,
	getTotalRolldownBuildInvocations,
	resetRolldownBuildInvocationCounts,
} from '../rolldown/rolldown-build-invocation-metrics.ts';
import { getServerModuleBuildCacheOutdir } from '../server/route-module-build-cache-registry.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';

function snapshotFixtureSources(): Map<string, Buffer> {
	const sourceDir = path.join(FIXTURE_APP_PROJECT_DIR, 'src');
	return new Map(
		readdirSync(sourceDir, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const filePath = path.join(entry.parentPath, entry.name);
				return [filePath, readFileSync(filePath)];
			}),
	);
}

describe('pages-unified-graph-build', () => {
	let appDir: string;
	let fixtureSourcesBefore: Map<string, Buffer>;

	beforeAll(() => {
		fixtureSourcesBefore = snapshotFixtureSources();
	});

	afterAll(() => {
		assert.deepEqual(
			snapshotFixtureSources(),
			fixtureSourcesBefore,
			'tests leave the fixture app sources unchanged',
		);
	});

	beforeEach(() => {
		appDir = copyFixtureApp();
	});

	afterEach(() => {
		resetRolldownBuildInvocationCounts();
		if (appDir) {
			rmSync(appDir, { recursive: true, force: true });
		}
	});

	it('identifies configured template extensions as unified-graph eligible', async () => {
		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		assert.equal(isPagesUnifiedGraphPage(path.join(appDir, 'src/pages/index.ts'), appConfig), true);
		assert.equal(isPagesUnifiedGraphPage(path.join(appDir, 'src/pages/index.kita.tsx'), appConfig), false);
	});

	it('leaves out Pages of any Integration that compiles its own modules', async () => {
		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
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
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', undefined);
		assert.equal(shouldBuildPagesUnifiedGraph(), true);

		for (const disabledValue of ['0', 'false']) {
			vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', disabledValue);
			assert.equal(shouldBuildPagesUnifiedGraph(), false);
		}

		vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', '1');
		vi.stubEnv('NODE_ENV', 'development');
		assert.equal(shouldBuildPagesUnifiedGraph(), false);
	});

	it('builds all string pages in one Rolldown invocation and reuses the graph in process', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const entryPaths = [
			path.join(appDir, 'src/pages/index.ts'),
			path.join(appDir, 'src/pages/404.ts'),
			path.join(appDir, 'src/pages/postcss-hmr.ts'),
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
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const entryPaths = [
			path.join(appDir, 'src/pages/index.ts'),
			path.join(appDir, 'src/pages/404.ts'),
			path.join(appDir, 'src/pages/postcss-hmr.ts'),
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

		const appModuleLoader = new AppModuleLoader(appConfig);
		resetRolldownBuildInvocationCounts();

		for (const entryPath of entryPaths) {
			const module = await appModuleLoader.importModule<{ default: unknown }>({
				filePath: entryPath,
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

	it('lets a later runtime import the emitted map from disk', async () => {
		vi.stubEnv('NODE_ENV', 'production');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
		const entryPath = path.join(appDir, 'src/pages/index.ts');
		const outdir = getServerBundleOutputPaths(appConfig).serverOutdir;
		await ensurePagesUnifiedGraphBuilt({ appConfig, entryPaths: [entryPath], outdir, force: true });
		assert.ok(await importPagesUnifiedGraphModule(appConfig, entryPath));

		const laterRuntime = await createFixtureAppConfig({ rootDir: appDir });
		assert.ok(await importPagesUnifiedGraphModule(laterRuntime, entryPath));
	});

	it('rejects import when the emitted entry module is deleted', async () => {
		vi.stubEnv('NODE_ENV', 'production');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
		const entryPath = path.join(appDir, 'src/pages/index.ts');
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [entryPath],
			outdir,
			force: true,
		});
		assert.ok(manifest);
		fileSystem.remove(manifest.outputs[entryPath]!);
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);
	});

	it('emits distinct modules for HTML Pages whose sanitized names would collide', async () => {
		vi.stubEnv('NODE_ENV', 'production');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
		const hyphenPage = path.join(appDir, 'src/pages/foo-bar.html');
		const nestedPage = path.join(appDir, 'src/pages/foo/bar.html');
		mkdirSync(path.dirname(nestedPage), { recursive: true });
		writeFileSync(hyphenPage, '<main>hyphen-page</main>');
		writeFileSync(nestedPage, '<main>nested-page</main>');

		const manifest = await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: hyphenPage }, { filePath: nestedPage }] },
		});

		const hyphenOutput = manifest.modules['src/pages/foo-bar.html'];
		const nestedOutput = manifest.modules['src/pages/foo/bar.html'];
		assert.ok(hyphenOutput);
		assert.ok(nestedOutput);
		assert.notEqual(hyphenOutput, nestedOutput);
		assert.notEqual(
			fileSystem.readFileSync(path.join(manifest.outdir, hyphenOutput)).toString(),
			fileSystem.readFileSync(path.join(manifest.outdir, nestedOutput)).toString(),
		);
	});

	it('reuses emitted modules when a file the config imports changes', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
		const configPath = path.join(appDir, 'eco.config.ts');
		const optionsPath = path.join(appDir, 'src/lib/mdx-plugin-options.ts');
		fileSystem.write(optionsPath, 'export const mdxPluginOptions = { remarkPlugins: [] };\n');
		appConfig.absolutePaths.config = configPath;
		appConfig.absolutePaths.configModuleFiles = [configPath, optionsPath];

		const entryPaths = [path.join(appDir, 'src/pages/index.ts')];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		await ensurePagesUnifiedGraphBuilt({ appConfig, entryPaths, outdir, force: true });

		fileSystem.write(optionsPath, 'export const mdxPluginOptions = { remarkPlugins: ["changed"] };\n');
		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({ appConfig, entryPaths, outdir });
		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});

	it('reuses emitted modules when template extensions change', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const entryPaths = [path.join(appDir, 'src/pages/index.ts')];
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

		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});

	it.each([
		{ layoutPlacement: 'in the entry chunk', pages: ['index.ts'] },
		{ layoutPlacement: 'in a chunk shared by several pages', pages: ['index.ts', '404.ts'] },
	])('reuses emitted modules when a layout $layoutPlacement changes', async ({ pages }) => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const entryPaths = pages.map((page) => path.join(appDir, 'src/pages', page));
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const layoutPath = path.join(appDir, 'src/layouts/base-layout/base-layout.ts');
		const originalLayout = fileSystem.readFileSync(layoutPath);

		resetRolldownBuildInvocationCounts();
		const manifest = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
			force: true,
		});
		assert.ok(manifest);
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		fileSystem.write(layoutPath, `${originalLayout}\nexport const cacheBust = 1;\n`);
		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});

	it('still imports the emitted module after a reachable source file is deleted', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const entryPaths = [path.join(appDir, 'src/pages/index.ts')];
		const outdir = getServerModuleBuildCacheOutdir(appConfig);
		const layoutPath = path.join(appDir, 'src/layouts/base-layout/base-layout.ts');
		const helperPath = path.join(appDir, 'src/layouts/base-layout/temp-helper.ts');
		const originalLayout = fileSystem.readFileSync(layoutPath);

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
		assert.equal(getTotalRolldownBuildInvocations(), 1);

		fileSystem.remove(helperPath);
		fileSystem.write(layoutPath, originalLayout);

		assert.ok(await importPagesUnifiedGraphModule(appConfig, entryPaths[0]));

		resetRolldownBuildInvocationCounts();
		await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths,
			outdir,
		});
		assert.equal(getTotalRolldownBuildInvocations(), 0);
	});

	it('reuses a superset map and rebuilds when a new entry is added', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const indexEntry = path.join(appDir, 'src/pages/index.ts');
		const notFoundEntry = path.join(appDir, 'src/pages/404.ts');
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
		assert.equal(getTotalRolldownBuildInvocations(), 0, 'reuses when requested entries are already emitted');

		resetRolldownBuildInvocationCounts();
		const manifestRestored = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, notFoundEntry],
			outdir,
		});
		assert.ok(manifestRestored);
		assert.equal(getTotalRolldownBuildInvocations(), 0, 'reuses when both entries are already emitted');

		const extraEntry = path.join(appDir, 'src/pages/postcss-hmr.ts');
		resetRolldownBuildInvocationCounts();
		const manifestWithExtra = await ensurePagesUnifiedGraphBuilt({
			appConfig,
			entryPaths: [indexEntry, extraEntry],
			outdir,
		});
		assert.ok(manifestWithExtra);
		assert.equal(getTotalRolldownBuildInvocations(), 1, 'rebuilds when a new entry is requested');
	});

	it('deduplicates duplicate entry paths caused by dynamic routes', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const appConfig = await createFixtureAppConfig({ rootDir: appDir });

		const indexEntry = path.join(appDir, 'src/pages/index.ts');
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
