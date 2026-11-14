import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { copyFixtureApp } from '../../../__fixtures__/app/copy-fixture-app.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import {
	emitProductionServerModules,
	findReEmittedModules,
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphPage,
	shouldBuildPagesUnifiedGraph,
} from './pages-unified-graph-build.ts';
import type { BuildChunk } from '../contracts/build-contracts.ts';

function chunk(...modules: string[]): BuildChunk {
	return { fileName: '', imports: [], dynamicImports: [], isEntry: false, facadeModuleId: null, modules };
}

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

	it('activates Integrations before importing emitted modules', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const setupFlag = '__ecoEmitIntegrationSetup';
		Reflect.deleteProperty(globalThis, setupFlag);
		const appConfig = await createFixtureAppConfig({ rootDir: appDir, globalScriptResolution: 'browser-build' });
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

	it('lists the app modules that moved between emits, except entries and packages', () => {
		const initial = {
			'/app/dist/page-a.mjs': {
				...chunk('/app/src/pages/index.tsx'),
				isEntry: true,
				facadeModuleId: '/app/src/pages/index.tsx',
				imports: ['/app/dist/layout-a.mjs', '/app/dist/kept.mjs', '/app/dist/pkg-a.mjs'],
			},
			'/app/dist/layout-a.mjs': chunk('/app/src/shells/shell.tsx'),
			'/app/dist/kept.mjs': chunk('/app/src/lib/kept.ts'),
			'/app/dist/pkg-a.mjs': chunk('/app/node_modules/pkg/index.js'),
		};
		const next = {
			'/app/dist/page-b.mjs': chunk('/app/src/pages/index.tsx'),
			'/app/dist/layout-b.mjs': chunk('/app/src/shells/shell.tsx'),
			'/app/dist/kept.mjs': chunk('/app/src/lib/kept.ts'),
			'/app/dist/pkg-b.mjs': chunk('/app/node_modules/pkg/index.js'),
		};

		assert.deepEqual(
			findReEmittedModules(initial, next, { entryPaths: ['/app/src/pages/index.tsx'], rootDir: '/app' }),
			[path.resolve('/app/src/shells/shell.tsx')],
		);
	});

	it('leaves out moved modules that the entries reach only through a dynamic import', () => {
		const initial = {
			'/app/dist/page-a.mjs': {
				...chunk('/app/src/pages/docs.tsx'),
				isEntry: true,
				facadeModuleId: '/app/src/pages/docs.tsx',
				imports: ['/app/dist/loader-a.mjs'],
			},
			'/app/dist/loader-a.mjs': { ...chunk('/app/src/lib/loader.ts'), dynamicImports: ['/app/dist/post-a.mjs'] },
			'/app/dist/post-a.mjs': { ...chunk('/app/src/content/post.mdx'), imports: ['/app/dist/shared-a.mjs'] },
			'/app/dist/shared-a.mjs': chunk('/app/src/lib/shared.ts'),
		};
		const next = {
			'/app/dist/page-b.mjs': chunk('/app/src/pages/docs.tsx'),
			'/app/dist/loader-b.mjs': chunk('/app/src/lib/loader.ts'),
			'/app/dist/post-b.mjs': chunk('/app/src/content/post.mdx'),
			'/app/dist/shared-b.mjs': chunk('/app/src/lib/shared.ts'),
		};

		assert.deepEqual(
			findReEmittedModules(initial, next, { entryPaths: ['/app/src/pages/docs.tsx'], rootDir: '/app' }),
			[path.resolve('/app/src/lib/loader.ts')],
		);
	});
});
