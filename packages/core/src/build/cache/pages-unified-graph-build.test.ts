import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
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
		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
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
		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
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

	it('activates Integrations before importing emitted modules', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const setupFlag = '__ecoEmitIntegrationSetup';
		Reflect.deleteProperty(globalThis, setupFlag);
		const appConfig = await createFixtureAppConfig({ rootDir: appDir });
		for (const integration of appConfig.integrations) {
			const originalSetup = integration.setup.bind(integration);
			integration.setup = async (context) => {
				Object.assign(globalThis, { [setupFlag]: true });
				await originalSetup(context);
			};
		}

		const pagePath = path.join(appDir, 'src/pages/needs-setup.ts');
		writeFileSync(
			pagePath,
			[
				`if (!globalThis.${setupFlag}) {`,
				`\tthrow new Error('Integration setup must run before this module is imported');`,
				'}',
				`export default () => 'ok';`,
				'',
			].join('\n'),
		);

		try {
			await emitProductionServerModules({
				appConfig,
				router: { templateRoutes: [{ filePath: pagePath }] },
			});
		} finally {
			Reflect.deleteProperty(globalThis, setupFlag);
		}
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
});
