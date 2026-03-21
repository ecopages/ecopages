import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { assertNodeRuntimeManifest, createNodeRuntimeAdapter } from './runtime-adapter.ts';
import { TranspilerServerLoader } from '../../services/server-loader.service.ts';

test('assertNodeRuntimeManifest accepts the current runtime manifest shape', () => {
	const manifest = assertNodeRuntimeManifest({
		runtime: 'node',
		appRootDir: '/repo',
		sourceRootDir: '/repo/src',
		distDir: '/repo/.eco',
		modulePaths: {
			config: '/repo/eco.config.ts',
			entry: '/repo/app.ts',
		},
		buildPlugins: {
			loaderPluginNames: ['loader-plugin'],
			runtimePluginNames: ['runtime-plugin'],
			browserBundlePluginNames: ['browser-plugin'],
		},
		serverTranspile: {
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			externalPackages: true,
		},
		browserBundles: {
			outputDir: '/repo/.eco/assets',
			publicBaseUrl: '/assets',
			vendorBaseUrl: '/assets/vendors',
		},
		bootstrap: {
			devGraphStrategy: 'noop',
			runtimeSpecifierRegistry: 'in-memory',
		},
	});

	assert.equal(manifest.modulePaths.entry, '/repo/app.ts');
	assert.deepEqual(manifest.buildPlugins.loaderPluginNames, ['loader-plugin']);
});

test('node runtime adapter loads the config module and app entry through core-owned services', async () => {
	const workspaceRoot = process.cwd();
	const projectDir = fs.mkdtempSync(path.join(workspaceRoot, '.tmp-node-runtime-adapter-'));
	const marker = globalThis as typeof globalThis & {
		__ecoNodeRuntimeLoaded?: {
			rootDir: string;
		};
	};

	try {
		fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, 'eco.config.ts'),
			[
				`const rootDir = ${JSON.stringify(projectDir)};`,
				'const config = {',
				"\tbaseUrl: 'http://localhost:3000',",
				'\trootDir,',
				"\tsrcDir: 'src',",
				"\tpublicDir: 'public',",
				"\tpagesDir: 'pages',",
				"\tincludesDir: 'includes',",
				"\tlayoutsDir: 'layouts',",
				"\tdistDir: '.eco',",
				'\ttemplatesExt: [],',
				"\tcomponentsDir: 'components',",
				"\trobotsTxt: { preferences: { '*': [] } },",
				'\tadditionalWatchPaths: [],',
				"\tdefaultMetadata: { title: 'Test', description: 'Test' },",
				'\tintegrations: [],',
				'\tintegrationsDependencies: [],',
				'\tabsolutePaths: {',
				'\t\tconfig: `${rootDir}/eco.config.ts`,',
				'\t\tcomponentsDir: `${rootDir}/src/components`,',
				'\t\tdistDir: `${rootDir}/.eco`,',
				'\t\tincludesDir: `${rootDir}/src/includes`,',
				'\t\tlayoutsDir: `${rootDir}/src/layouts`,',
				'\t\tpagesDir: `${rootDir}/src/pages`,',
				'\t\tprojectDir: rootDir,',
				'\t\tpublicDir: `${rootDir}/public`,',
				'\t\tsrcDir: `${rootDir}/src`,',
				'\t\thtmlTemplatePath: `${rootDir}/src/index.html`,',
				'\t\terror404TemplatePath: `${rootDir}/src/404.html`,',
				'\t},',
				'\tprocessors: new Map(),',
				'\tloaders: new Map(),',
				'};',
				'export default config;',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'app.ts'),
			[
				"import appConfig from './eco.config';",
				'const runtimeMarker = globalThis as typeof globalThis & { __ecoNodeRuntimeLoaded?: { rootDir: string } };',
				'runtimeMarker.__ecoNodeRuntimeLoaded = {',
				'\trootDir: appConfig.rootDir,',
				'};',
			].join('\n'),
			'utf8',
		);

		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});

		const loadedAppRuntime = await session.loadApp();

		assert.equal(loadedAppRuntime.entryModulePath, path.join(projectDir, 'app.ts'));
		assert.equal(loadedAppRuntime.appConfig.rootDir, projectDir);
		assert.equal(typeof loadedAppRuntime.entryModule, 'object');
		assert.deepEqual(marker.__ecoNodeRuntimeLoaded, {
			rootDir: projectDir,
		});
		await assert.doesNotReject(() => session.invalidate(['/repo/src/pages/index.tsx']));
		await assert.doesNotReject(() => session.dispose());
	} finally {
		delete marker.__ecoNodeRuntimeLoaded;
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
});

test('node runtime adapter fails on real bootstrap problems instead of the placeholder message', async () => {
	const adapter = createNodeRuntimeAdapter();
	const manifest = assertNodeRuntimeManifest({
		runtime: 'node',
		appRootDir: '/repo',
		sourceRootDir: '/repo/src',
		distDir: '/repo/.eco',
		modulePaths: {
			config: '/repo/eco.config.ts',
			entry: '/repo/app.ts',
		},
		buildPlugins: {
			loaderPluginNames: [],
			runtimePluginNames: [],
			browserBundlePluginNames: [],
		},
		serverTranspile: {
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			externalPackages: true,
		},
		browserBundles: {
			outputDir: '/repo/.eco/assets',
			publicBaseUrl: '/assets',
			vendorBaseUrl: '/assets/vendors',
		},
		bootstrap: {
			devGraphStrategy: 'noop',
			runtimeSpecifierRegistry: 'in-memory',
		},
	});

	const session = await adapter.start({
		manifest,
		workingDirectory: '/repo',
		cliArgs: ['app.ts', '--dev'],
	});

	await assert.rejects(
		() => session.loadApp(),
		/Failed to transpile Ecopages config module|No transpiled output generated for Ecopages config module|Error hashing file:/,
	);
});

test('node runtime adapter routes config and entry bootstrap imports through the explicit server-loader boundary', async () => {
	const loadConfig = vi.spyOn(TranspilerServerLoader.prototype, 'loadConfig');
	const loadApp = vi.spyOn(TranspilerServerLoader.prototype, 'loadApp');
	const reboundContexts: Array<{ rootDir: string }> = [];
	const rebindAppContext = vi.spyOn(TranspilerServerLoader.prototype, 'rebindAppContext');
	const projectDir = '/repo';

	loadConfig.mockImplementationOnce(async () => {
		return {
			rootDir: projectDir,
			absolutePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				srcDir: path.join(projectDir, 'src'),
				distDir: path.join(projectDir, '.eco'),
			},
			loaders: new Map(),
			runtime: {},
		};
	});
	loadApp.mockImplementationOnce(async () => ({}));
	rebindAppContext.mockImplementation((context) => {
		reboundContexts.push({ rootDir: context.rootDir });
	});

	try {
		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});

		const loadedAppRuntime = await session.loadApp();
		assert.equal(loadConfig.mock.calls.length, 1);
		assert.equal(loadApp.mock.calls.length, 1);
		assert.deepEqual(reboundContexts, [{ rootDir: projectDir }]);
		assert.equal(loadedAppRuntime.entryModulePath, path.join(projectDir, 'app.ts'));
		assert.equal(loadedAppRuntime.appConfig.rootDir, projectDir);
		assert.equal(typeof loadedAppRuntime.entryModule, 'object');
	} finally {
		loadConfig.mockRestore();
		loadApp.mockRestore();
		rebindAppContext.mockRestore();
	}
});

test('node runtime adapter caches the loaded runtime until invalidation requests a fresh app load', async () => {
	const projectDir = '/repo';
	const loadConfig = vi.spyOn(TranspilerServerLoader.prototype, 'loadConfig');
	const loadApp = vi.spyOn(TranspilerServerLoader.prototype, 'loadApp');
	const invalidate = vi.spyOn(TranspilerServerLoader.prototype, 'invalidate');
	let appLoadCount = 0;

	loadConfig.mockImplementationOnce(async () => {
		return {
			rootDir: projectDir,
			absolutePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				srcDir: path.join(projectDir, 'src'),
				distDir: path.join(projectDir, '.eco'),
				publicDir: path.join(projectDir, 'public'),
				includesDir: path.join(projectDir, 'src', 'includes'),
				pagesDir: path.join(projectDir, 'src', 'pages'),
			},
			additionalWatchPaths: [],
			templatesExt: [],
			processors: new Map(),
			loaders: new Map(),
			runtime: {},
		};
	});
	loadApp.mockImplementation(async () => ({ loadNumber: ++appLoadCount }));

	try {
		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});

		const firstRuntime = await session.loadApp();
		const secondRuntime = await session.loadApp();

		assert.strictEqual(secondRuntime, firstRuntime);
		assert.equal(loadConfig.mock.calls.length, 1);
		assert.equal(loadApp.mock.calls.length, 1);

		await session.invalidate([path.join(projectDir, 'src', 'pages', 'index.tsx')]);

		const thirdRuntime = await session.loadApp();

		assert.notStrictEqual(thirdRuntime, firstRuntime);
		assert.equal(loadConfig.mock.calls.length, 1);
		assert.equal(loadApp.mock.calls.length, 2);
		assert.deepEqual(invalidate.mock.calls[0]?.[0], [path.join(projectDir, 'src', 'pages', 'index.tsx')]);
	} finally {
		loadConfig.mockRestore();
		loadApp.mockRestore();
		invalidate.mockRestore();
	}
});

test('node runtime adapter bootstraps an app entry that imports core runtime code plus a local config module', async () => {
	const workspaceRoot = process.cwd();
	const projectDir = fs.mkdtempSync(path.join(workspaceRoot, '.tmp-node-runtime-adapter-entry-'));
	const marker = globalThis as typeof globalThis & {
		__ecoNodeRuntimeEntryBootstrap?: {
			hasCreateApp: boolean;
			rootDir: string;
		};
	};

	try {
		fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, 'eco.config.ts'),
			[
				`const rootDir = ${JSON.stringify(projectDir)};`,
				'const config = {',
				"\tbaseUrl: 'http://localhost:3000',",
				'\trootDir,',
				"\tsrcDir: 'src',",
				"\tpublicDir: 'public',",
				"\tpagesDir: 'pages',",
				"\tincludesDir: 'includes',",
				"\tlayoutsDir: 'layouts',",
				"\tdistDir: '.eco',",
				'\ttemplatesExt: [],',
				"\tcomponentsDir: 'components',",
				"\trobotsTxt: { preferences: { '*': [] } },",
				'\tadditionalWatchPaths: [],',
				"\tdefaultMetadata: { title: 'Test', description: 'Test' },",
				'\tintegrations: [],',
				'\tintegrationsDependencies: [],',
				'\tabsolutePaths: {',
				'\t\tconfig: `${rootDir}/eco.config.ts`,',
				'\t\tcomponentsDir: `${rootDir}/src/components`,',
				'\t\tdistDir: `${rootDir}/.eco`,',
				'\t\tincludesDir: `${rootDir}/src/includes`,',
				'\t\tlayoutsDir: `${rootDir}/src/layouts`,',
				'\t\tpagesDir: `${rootDir}/src/pages`,',
				'\t\tprojectDir: rootDir,',
				'\t\tpublicDir: `${rootDir}/public`,',
				'\t\tsrcDir: `${rootDir}/src`,',
				'\t\thtmlTemplatePath: `${rootDir}/src/index.html`,',
				'\t\terror404TemplatePath: `${rootDir}/src/404.html`,',
				'\t},',
				'\tprocessors: new Map(),',
				'\tloaders: new Map(),',
				'};',
				'export default config;',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'app.ts'),
			[
				"import { createApp } from '@ecopages/core';",
				"import appConfig from './eco.config';",
				'const runtimeMarker = globalThis as typeof globalThis & { __ecoNodeRuntimeEntryBootstrap?: { hasCreateApp: boolean; rootDir: string } };',
				'runtimeMarker.__ecoNodeRuntimeEntryBootstrap = {',
				'\thasCreateApp: typeof createApp === "function",',
				'\trootDir: appConfig.rootDir,',
				'};',
			].join('\n'),
			'utf8',
		);

		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});

		await session.loadApp();

		assert.deepEqual(marker.__ecoNodeRuntimeEntryBootstrap, {
			hasCreateApp: true,
			rootDir: projectDir,
		});
		await assert.doesNotReject(() => session.dispose());
	} finally {
		delete marker.__ecoNodeRuntimeEntryBootstrap;
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
});

test('node runtime adapter preserves config import.meta.dirname semantics during bootstrap transpilation', async () => {
	const workspaceRoot = process.cwd();
	const projectDir = fs.mkdtempSync(path.join(workspaceRoot, '.tmp-node-runtime-adapter-import-meta-'));
	const marker = globalThis as typeof globalThis & {
		__ecoNodeRuntimeImportMeta?: {
			rootDir: string;
			htmlTemplatePath: string;
		};
	};

	try {
		fs.mkdirSync(path.join(projectDir, 'src', 'includes'), { recursive: true });
		fs.writeFileSync(path.join(projectDir, 'src', 'includes', 'html.kita.tsx'), 'export default {};\n', 'utf8');
		fs.writeFileSync(
			path.join(projectDir, 'eco.config.ts'),
			[
				'const rootDir = import.meta.dirname;',
				'const config = {',
				"\tbaseUrl: 'http://localhost:3000',",
				'\trootDir,',
				"\tsrcDir: 'src',",
				"\tpublicDir: 'public',",
				"\tpagesDir: 'pages',",
				"\tincludesDir: 'includes',",
				"\tlayoutsDir: 'layouts',",
				"\tdistDir: '.eco',",
				"\ttemplatesExt: ['.kita.tsx'],",
				"\tcomponentsDir: 'components',",
				"\trobotsTxt: { preferences: { '*': [] } },",
				'\tadditionalWatchPaths: [],',
				"\tdefaultMetadata: { title: 'Test', description: 'Test' },",
				'\tintegrations: [],',
				'\tintegrationsDependencies: [],',
				'\tabsolutePaths: {',
				'\t\tconfig: `${rootDir}/eco.config.ts`,',
				'\t\tcomponentsDir: `${rootDir}/src/components`,',
				'\t\tdistDir: `${rootDir}/.eco`,',
				'\t\tincludesDir: `${rootDir}/src/includes`,',
				'\t\tlayoutsDir: `${rootDir}/src/layouts`,',
				'\t\tpagesDir: `${rootDir}/src/pages`,',
				'\t\tprojectDir: rootDir,',
				'\t\tpublicDir: `${rootDir}/public`,',
				'\t\tsrcDir: `${rootDir}/src`,',
				'\t\thtmlTemplatePath: `${rootDir}/src/includes/html.kita.tsx`,',
				'\t\terror404TemplatePath: `${rootDir}/src/pages/404.kita.tsx`,',
				'},',
				'\tprocessors: new Map(),',
				'\tloaders: new Map(),',
				'};',
				'export default config;',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'app.ts'),
			[
				"import appConfig from './eco.config';",
				'const runtimeMarker = globalThis as typeof globalThis & { __ecoNodeRuntimeImportMeta?: { rootDir: string; htmlTemplatePath: string } };',
				'runtimeMarker.__ecoNodeRuntimeImportMeta = {',
				'\trootDir: appConfig.rootDir,',
				'\thtmlTemplatePath: appConfig.absolutePaths.htmlTemplatePath,',
				'};',
			].join('\n'),
			'utf8',
		);

		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});

		const loadedAppRuntime = await session.loadApp();

		assert.equal(loadedAppRuntime.appConfig.rootDir, projectDir);
		assert.equal(
			loadedAppRuntime.appConfig.absolutePaths.htmlTemplatePath,
			path.join(projectDir, 'src', 'includes', 'html.kita.tsx'),
		);
		assert.deepEqual(marker.__ecoNodeRuntimeImportMeta, {
			rootDir: projectDir,
			htmlTemplatePath: path.join(projectDir, 'src', 'includes', 'html.kita.tsx'),
		});
		await assert.doesNotReject(() => session.dispose());
	} finally {
		delete marker.__ecoNodeRuntimeImportMeta;
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
});

test('node runtime adapter preserves layout metadata for explicit ctx.render routes', async () => {
	const workspaceRoot = process.cwd();
	const kitchenSinkRoot = path.join(workspaceRoot, 'playground', 'kitchen-sink');
	const projectDir = fs.mkdtempSync(path.join(kitchenSinkRoot, '.tmp-node-runtime-adapter-explicit-render-'));
	const runtimeMarker = globalThis as typeof globalThis & {
		__ecoNodeRuntimeExplicitRender?: {
			explicitHasLayout?: boolean;
			latestHasLayout?: boolean;
		};
	};

	try {
		const workspaceNodeModulesDir = path.join(workspaceRoot, 'node_modules');
		fs.mkdirSync(path.join(projectDir, 'src', 'includes'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'layouts'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'views'), { recursive: true });
		if (fs.existsSync(workspaceNodeModulesDir)) {
			fs.symlinkSync(workspaceNodeModulesDir, path.join(projectDir, 'node_modules'), 'dir');
		}
		fs.writeFileSync(
			path.join(projectDir, 'eco.config.ts'),
			[
				"import { ConfigBuilder } from '@ecopages/core/config-builder';",
				"import { kitajsPlugin } from '@ecopages/kitajs';",
				'const appRoot = import.meta.dirname;',
				'const config = await new ConfigBuilder()',
				'\t.setRootDir(appRoot)',
				"\t.setBaseUrl('http://localhost:3000')",
				'\t.setIntegrations([kitajsPlugin()])',
				'\t.build();',
				'export default config;',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'includes', 'html.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				'export default eco.html({',
				'\trender: ({ children }) => <html><body>{children}</body></html>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'layouts', 'base-layout.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				'export const BaseLayout = eco.layout({',
				'\trender: ({ children }) => <main data-layout="base-layout">{children}</main>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'views', 'explicit-view.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { BaseLayout } from '../layouts/base-layout.kita';",
				'export default eco.page({',
				'\tdependencies: {',
				'\t\tcomponents: [BaseLayout],',
				'\t},',
				"\tintegration: 'kitajs',",
				'\tlayout: BaseLayout,',
				'\trender: () => <section data-view="explicit">Explicit route body</section>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'views', 'latest-view.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { BaseLayout } from '../layouts/base-layout.kita';",
				'type LatestViewProps = {',
				'\tname: string;',
				'};',
				'export default eco.page<LatestViewProps>({',
				'\tdependencies: {',
				'\t\tcomponents: [BaseLayout],',
				'\t},',
				"\tintegration: 'kitajs',",
				'\tlayout: BaseLayout,',
				'\trender: ({ name }) => <section data-view="latest">Latest route for {name}</section>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'app.ts'),
			[
				"import { createApp } from '@ecopages/core';",
				"import appConfig from './eco.config';",
				'const app = await createApp({ appConfig });',
				'const runtimeMarker = globalThis as typeof globalThis & {',
				'\t__ecoNodeRuntimeExplicitRender?: {',
				'\t\texplicitHasLayout?: boolean;',
				'\t\tlatestHasLayout?: boolean;',
				'\t};',
				'};',
				"app.get('/explicit', async (ctx) => {",
				"\tconst { default: ExplicitView } = await import('./src/views/explicit-view.kita');",
				'\truntimeMarker.__ecoNodeRuntimeExplicitRender = {',
				'\t\t...runtimeMarker.__ecoNodeRuntimeExplicitRender,',
				'\t\texplicitHasLayout: Boolean(ExplicitView.config?.layout),',
				'\t};',
				'\treturn ctx.render(ExplicitView, {});',
				'});',
				"app.get('/latest', async (ctx) => {",
				"\tconst { default: LatestView } = await import('./src/views/latest-view.kita');",
				'\truntimeMarker.__ecoNodeRuntimeExplicitRender = {',
				'\t\t...runtimeMarker.__ecoNodeRuntimeExplicitRender,',
				'\t\tlatestHasLayout: Boolean(LatestView.config?.layout),',
				'\t};',
				"\treturn ctx.render(LatestView, { name: 'node-thin-host' });",
				'});',
				'export default app;',
			].join('\n'),
			'utf8',
		);

		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		const session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});
		const loadedAppRuntime = await session.loadApp();
		const runtimeApp = loadedAppRuntime.entryModule as {
			default?: {
				fetch(request: Request): Promise<Response>;
			};
		};
		assert.ok(runtimeApp.default);

		const explicitResponse = await runtimeApp.default.fetch(new Request('http://localhost:3000/explicit'));
		const latestResponse = await runtimeApp.default.fetch(new Request('http://localhost:3000/latest'));
		const explicitHtml = await explicitResponse.text();
		const latestHtml = await latestResponse.text();

		assert.equal(runtimeMarker.__ecoNodeRuntimeExplicitRender?.explicitHasLayout, true);
		assert.equal(runtimeMarker.__ecoNodeRuntimeExplicitRender?.latestHasLayout, true);
		assert.match(explicitHtml, /data-layout="base-layout"/);
		assert.match(explicitHtml, /data-view="explicit"/);
		assert.match(latestHtml, /data-layout="base-layout"/);
		assert.match(latestHtml, /data-view="latest"/);

		await assert.doesNotReject(() => session.dispose());
	} finally {
		delete runtimeMarker.__ecoNodeRuntimeExplicitRender;
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
});

test('node runtime adapter preserves explicit-route view metadata before renderer recovery', async () => {
	const workspaceRoot = process.cwd();
	const kitchenSinkRoot = path.join(workspaceRoot, 'playground', 'kitchen-sink');
	const projectDir = fs.mkdtempSync(path.join(kitchenSinkRoot, '.tmp-node-runtime-adapter-direct-view-metadata-'));
	let session: Awaited<ReturnType<ReturnType<typeof createNodeRuntimeAdapter>['start']>> | undefined;

	try {
		const workspaceNodeModulesDir = path.join(workspaceRoot, 'node_modules');
		fs.mkdirSync(path.join(projectDir, 'src', 'components'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'data'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'includes'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'layouts', 'base-layout'), { recursive: true });
		fs.mkdirSync(path.join(projectDir, 'src', 'views'), { recursive: true });
		if (fs.existsSync(workspaceNodeModulesDir)) {
			fs.symlinkSync(workspaceNodeModulesDir, path.join(projectDir, 'node_modules'), 'dir');
		}
		fs.writeFileSync(
			path.join(projectDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						baseUrl: '.',
						jsx: 'react-jsx',
						jsxImportSource: '@kitajs/html',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						paths: {
							'@/*': ['./src/*'],
						},
					},
				},
				null,
				2,
			),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'eco.config.ts'),
			[
				"import { ConfigBuilder } from '@ecopages/core/config-builder';",
				"import { kitajsPlugin } from '@ecopages/kitajs';",
				'const appRoot = import.meta.dirname;',
				'const config = await new ConfigBuilder()',
				'\t.setRootDir(appRoot)',
				"\t.setBaseUrl('http://localhost:3000')",
				'\t.setIntegrations([kitajsPlugin()])',
				'\t.build();',
				'export default config;',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'components', 'theme-toggle.react.tsx'),
			[
				'/** @jsxImportSource react */',
				"import { eco } from '@ecopages/core';",
				"import type { JSX } from 'react';",
				'export const ThemeToggleReact = eco.component<{}, JSX.Element>({',
				"\tintegration: 'react',",
				'\trender: () => <button type="button">Toggle theme</button>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'data', 'primary-links.ts'),
			[
				'export function getPrimaryLinkTestId(href: string): string {',
				"\treturn `primary-link-${href.replace(/^\\//, '').replace(/\\//g, '-') || 'home'}`;",
				'}',
				"export const kitchenSinkShell = { eyebrow: 'Kitchen sink', title: 'Explicit route metadata' } as const;",
				"export const primaryLinks = [{ href: '/', label: 'Overview' }] as const;",
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'includes', 'html.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				'export default eco.html({',
				'\trender: ({ children }) => <html><body>{children}</body></html>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'layouts', 'base-layout', 'base-layout.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { ThemeToggleReact } from '../../components/theme-toggle.react';",
				"import { getPrimaryLinkTestId, kitchenSinkShell, primaryLinks } from '@/data/primary-links';",
				'export const BaseLayout = eco.layout({',
				'\tdependencies: {',
				'\t\tcomponents: [ThemeToggleReact],',
				'\t},',
				'\trender: ({ children }) => (',
				'\t\t<div>',
				'\t\t\t<header>',
				'\t\t\t\t<p>{kitchenSinkShell.eyebrow}</p>',
				'\t\t\t\t<h1>{kitchenSinkShell.title}</h1>',
				'\t\t\t\t<nav>',
				'\t\t\t\t\t{primaryLinks.map((link) => (',
				'\t\t\t\t\t\t<a href={link.href} data-testid={getPrimaryLinkTestId(link.href)}>{link.label}</a>',
				'\t\t\t\t\t))}',
				'\t\t\t\t</nav>',
				'\t\t\t\t{/* @ts-expect-error - jsx mismatch */}',
				'\t\t\t\t<ThemeToggleReact />',
				'\t\t\t</header>',
				'\t\t\t<main data-layout="base-layout">{children}</main>',
				'\t\t</div>',
				'\t),',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'layouts', 'base-layout', 'index.ts'),
			"export * from './base-layout.kita';\n",
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'views', 'latest-view.kita.tsx'),
			[
				"import { eco } from '@ecopages/core';",
				"import { BaseLayout } from '@/layouts/base-layout';",
				'export default eco.page({',
				'\tdependencies: {',
				'\t\tcomponents: [BaseLayout],',
				'\t},',
				"\tintegration: 'kitajs',",
				'\tlayout: BaseLayout,',
				'\trender: () => <section data-view="latest">Latest route body</section>,',
				'});',
			].join('\n'),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'app.ts'),
			[
				"import { createApp } from '@ecopages/core';",
				"import appConfig from './eco.config';",
				'const app = await createApp({ appConfig });',
				"app.get('/metadata', async (ctx) => {",
				"\tconst { default: LatestView } = await import('./src/views/latest-view.kita');",
				'\tconst initialComponentDependencies = LatestView.config?.dependencies?.components;',
				'\tconst initialMetadata = {',
				'\t\thasLayout: Boolean(LatestView.config?.layout),',
				'\t\thasEcoFile: Boolean(LatestView.config?.__eco?.file),',
				'\t\tcomponentDependencyCount:',
				'\t\t\tArray.isArray(initialComponentDependencies) ? initialComponentDependencies.length : 0,',
				'\t\tallComponentDependenciesDefined:',
				'\t\t\tArray.isArray(initialComponentDependencies) &&',
				'\t\t\tinitialComponentDependencies.every((component) => Boolean(component)),',
				'\t};',
				"\tconst barrelModule = await import('./src/layouts/base-layout');",
				"\tconst directLayoutModule = await import('./src/layouts/base-layout/base-layout.kita');",
				'\treturn ctx.json({',
				'\t\tbarrelHasLayoutExport: Boolean(barrelModule.BaseLayout),',
				'\t\tdirectHasLayoutExport: Boolean(directLayoutModule.BaseLayout),',
				'\t\t...initialMetadata,',
				'\t});',
				'});',
				'export default app;',
			].join('\n'),
			'utf8',
		);

		const adapter = createNodeRuntimeAdapter();
		const manifest = assertNodeRuntimeManifest({
			runtime: 'node',
			appRootDir: projectDir,
			sourceRootDir: path.join(projectDir, 'src'),
			distDir: path.join(projectDir, '.eco'),
			modulePaths: {
				config: path.join(projectDir, 'eco.config.ts'),
				entry: path.join(projectDir, 'app.ts'),
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: path.join(projectDir, '.eco', 'assets'),
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		});

		session = await adapter.start({
			manifest,
			workingDirectory: projectDir,
			cliArgs: ['app.ts', '--dev'],
		});
		const loadedAppRuntime = await session.loadApp();
		const runtimeApp = loadedAppRuntime.entryModule as {
			default?: {
				fetch(request: Request): Promise<Response>;
			};
		};
		assert.ok(runtimeApp.default);

		const metadataResponse = await runtimeApp.default.fetch(new Request('http://localhost:3000/metadata'));
		const metadata = (await metadataResponse.json()) as {
			barrelHasLayoutExport: boolean;
			directHasLayoutExport: boolean;
			hasLayout: boolean;
			hasEcoFile: boolean;
			componentDependencyCount: number;
			allComponentDependenciesDefined: boolean;
		};

		assert.deepEqual(metadata, {
			barrelHasLayoutExport: true,
			directHasLayoutExport: true,
			hasEcoFile: true,
			hasLayout: true,
			componentDependencyCount: 2,
			allComponentDependenciesDefined: true,
		});
	} finally {
		if (session) {
			await assert.doesNotReject(() => session.dispose());
		}
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}, 15000);
