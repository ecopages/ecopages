import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import { warnAboutUnattachedScripts } from '../../adapters/shared/runtime/unattached-scripts.ts';
import { copyFixtureApp } from '../../../__fixtures__/app/copy-fixture-app.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import {
	emitProductionServerModules,
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphPage,
	shouldBuildPagesUnifiedGraph,
} from './pages-unified-graph-build.ts';

describe('production server-module graph', () => {
	let appDir: string;

	beforeEach(() => {
		appDir = copyFixtureApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		if (appDir) rmSync(appDir, { recursive: true, force: true });
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

	it('opts out of production server-module emit only when the build flag is disabled', () => {
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

	it('emits a map that a later app runtime can import', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
		const entryPath = path.join(appDir, 'src/pages/index.ts');
		const manifest = await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: entryPath }] },
		});

		assert.ok(manifest.modules['src/pages/index.ts']);
		assert.ok(await importPagesUnifiedGraphModule(appConfig, entryPath));

		const laterRuntime = await createFixtureAppConfig({ rootDir: appDir });
		assert.ok(await importPagesUnifiedGraphModule(laterRuntime, entryPath));
	});

	it('does not import an emitted entry whose output has been removed', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
		const entryPath = path.join(appDir, 'src/pages/index.ts');
		const manifest = await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: entryPath }] },
		});
		const emitted = manifest.modules['src/pages/index.ts'];
		assert.ok(emitted);

		fileSystem.remove(path.join(manifest.outdir, emitted));
		assert.equal(await importPagesUnifiedGraphModule(appConfig, entryPath), undefined);
	});

	it('emits each ssr script a declaration lists as an entry of the same build', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
		const pagePath = path.join(appDir, 'src/pages/with-script.ts');
		writeFileSync(path.join(appDir, 'src/pages/counter.script.ts'), `export const counter = 1;\n`);
		writeFileSync(
			pagePath,
			`export default { config: { dependencies: { scripts: [{ src: './counter.script.ts', ssr: true }] } } };\n`,
		);

		const manifest = await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: pagePath }] },
		});

		assert.ok(manifest.modules['src/pages/counter.script.ts']);
		assert.ok(fileSystem.exists(path.join(manifest.outdir, manifest.modules['src/pages/counter.script.ts'])));
	});

	it('emits distinct modules for HTML Pages whose sanitized names would collide', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
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

	it('warns once about each .script file no declaration attaches', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
		const pagePath = path.join(appDir, 'src/pages/with-scripts.ts');
		writeFileSync(path.join(appDir, 'src/pages/listed.script.ts'), `import './helper.script.ts';\n`);
		writeFileSync(path.join(appDir, 'src/pages/helper.script.ts'), `export const helper = 1;\n`);
		writeFileSync(path.join(appDir, 'src/pages/typo.script.ts'), `export const typo = 1;\n`);
		writeFileSync(
			pagePath,
			`export default { config: { dependencies: { scripts: ['./listed.script.ts', './listed-typo.script.ts'] } } };\n`,
		);

		await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: pagePath }] },
			onServerSources: (sources) => warnAboutUnattachedScripts(appConfig, sources),
		});

		const messages = warn.mock.calls.map(([message]) => String(message));
		assert.equal(messages.length, 1);
		assert.match(messages[0] ?? '', /src\/pages\/typo\.script\.ts/);
		warn.mockRestore();
	});

	it('does not warn about a .script file an HTML Page loads with <script src>', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
		const htmlPage = path.join(appDir, 'src/pages/html-script.html');
		writeFileSync(path.join(appDir, 'src/pages/html.script.ts'), `export const html = 1;\n`);
		writeFileSync(htmlPage, '<main><script type="module" src="./html.script.ts"></script></main>');

		await emitProductionServerModules({
			appConfig,
			router: { templateRoutes: [{ filePath: htmlPage }] },
			onServerSources: (sources) => warnAboutUnattachedScripts(appConfig, sources),
		});

		assert.deepEqual(warn.mock.calls, []);
		warn.mockRestore();
	});
});
