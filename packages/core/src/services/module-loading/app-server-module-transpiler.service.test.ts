import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import { type BuildExecutor, setAppBuildAdapter, setAppBuildManifest } from '../../build/build-adapter.ts';
import { installBuildRuntime } from '../../build/runtime-build-executor.ts';
import { RolldownBuildAdapter } from '../../build/rolldown-build-adapter.ts';
import type { EcoPagesElement } from '../../types/public-types.ts';
import {
	createAppServerModuleTranspiler,
	getAppHostModuleLoader,
	getAppModuleLoader,
	setAppHostModuleLoader,
	shouldAppUseHostModuleLoader,
} from './app-server-module-transpiler.service.ts';

describe('app server module transpiler runtime state', () => {
	it('stores and exposes an abstract host module loader on app runtime state', () => {
		const appConfig = {
			runtime: {},
		} as any;
		const hostModuleLoader = async (id: string) => ({ id });

		setAppHostModuleLoader(appConfig, hostModuleLoader);

		assert.equal(getAppHostModuleLoader(appConfig), hostModuleLoader);
	});

	it('exposes host ownership when a host module loader is configured', () => {
		const hostModuleLoader = async (id: string) => ({ id });
		const appConfig = {
			rootDir: '/app',
			runtime: {
				hostModuleLoader,
			},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig);

		assert.equal(moduleLoader.owner, 'host');
	});

	it('creates a server transpiler that uses the app module loader', () => {
		const hostModuleLoader = async (id: string) => ({ id });
		const appConfig = {
			rootDir: '/app',
			runtime: {
				hostModuleLoader,
			},
		} as any;

		const transpiler = createAppServerModuleTranspiler(appConfig);

		assert.ok(transpiler);
		assert.equal(getAppHostModuleLoader(appConfig), hostModuleLoader);
	});

	it('keeps Ecopages integration modules on the framework transpiler path', () => {
		const appConfig = {
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			templatesExt: ['.kita.tsx', '.lit.tsx'],
		} as any;

		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/runtime/helpers.ts'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/index.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/includes/html.kita.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/layouts/base-layout.kita.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/counter.lit.tsx'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/components/counter.lit.tsx'), false);
	});

	it('prefers the host module loader for framework-owned modules when a host runtime provides one', () => {
		const appConfig = {
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			runtime: {
				hostModuleLoader: async (id: string) => ({ id }),
			},
			templatesExt: ['.kita.tsx', '.lit.tsx'],
		} as any;

		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/runtime/helpers.ts'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/index.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/includes/html.kita.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/layouts/base-layout.kita.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/counter.lit.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/components/counter.lit.tsx'), true);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/docs.md'), false);
		assert.equal(shouldAppUseHostModuleLoader(appConfig, '/app/src/pages/react-content.mdx'), false);
	});

	it('compiles Bun-owned Kita modules to string render functions during app module imports', async () => {
		(
			globalThis as typeof globalThis & {
				Bun?: { hash(content: string | Buffer<ArrayBufferLike>): number | bigint };
			}
		).Bun = {
			hash: (content) => {
				const value = String(content);
				let hash = 0;

				for (let index = 0; index < value.length; index += 1) {
					hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
				}

				return hash;
			},
		};
		const tempParentDir = path.join(process.cwd(), 'playground', 'kitchen-sink');
		const tempRootBase = path.join(tempParentDir, '.tmp-app-module-loader-');
		fs.mkdirSync(tempParentDir, { recursive: true });
		const rootDir = fs.mkdtempSync(tempRootBase);
		const componentsDir = path.join(rootDir, 'src', 'components');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(componentsDir, { recursive: true });
		fs.mkdirSync(pagesDir, { recursive: true });

		const kitaComponentPath = path.join(componentsDir, 'kita-child.kita.tsx');
		fs.writeFileSync(
			kitaComponentPath,
			[
				"import { eco } from '@ecopages/core';",
				"import type { EcoPagesElement } from '@ecopages/core';",
				'',
				'export const KitaChild = eco.component<{}, EcoPagesElement>({',
				"\tintegration: 'kitajs',",
				'\trender: () => <div data-kita-child="true">Leaf</div>,',
				'});',
				'',
			].join('\n'),
			'utf8',
		);

		const appConfig = {
			rootDir,
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				componentsDir,
				includesDir: path.join(rootDir, 'src', 'includes'),
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir,
			},
			integrations: [
				{
					name: 'ecopages-jsx',
					extensions: ['.eco.tsx'],
					jsxImportSource: '@ecopages/jsx',
				},
				{
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				},
			],
			templatesExt: ['.eco.tsx', '.kita.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig);

		try {
			const imported = await moduleLoader.importModule<{
				KitaChild: (() => EcoPagesElement) & { config?: Record<string, unknown> };
			}>({
				filePath: kitaComponentPath,
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
				buildExecutor: new RolldownBuildAdapter(),
			});

			const rendered = imported.KitaChild();
			assert.equal(typeof rendered, 'string');
			assert.match(String(rendered), /data-kita-child/);
		} finally {
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('preserves top-level await through the Node app-module loader path', async () => {
		const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-node-app-module-tla-'));
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'test-app', type: 'module' }),
			'utf8',
		);
		const pageFilePath = path.join(pagesDir, 'index.ts');
		fs.writeFileSync(
			pageFilePath,
			['export const value = await Promise.resolve(42);', 'export default { ok: value === 42 };'].join('\n'),
			'utf8',
		);

		const appConfig = {
			rootDir,
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				componentsDir: path.join(rootDir, 'src', 'components'),
				includesDir: path.join(rootDir, 'src', 'includes'),
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir,
			},
			integrations: [],
			templatesExt: ['.ts'],
			runtime: {},
		} as any;

		try {
			const imported = await getAppModuleLoader(appConfig).importModule<{
				default: { ok: boolean };
				value: number;
			}>({
				filePath: pageFilePath,
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
				buildExecutor: new RolldownBuildAdapter(),
			});

			assert.deepEqual(imported.default, { ok: true });
			assert.equal(imported.value, 42);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('includes manifest runtime plugins in app module imports', async () => {
		const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-app-module-runtime-plugins-'));
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		const pageFilePath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(pageFilePath, 'export default { ok: true };', 'utf8');
		fs.writeFileSync(
			path.join(rootDir, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
		);

		const observedPlugins: string[][] = [];
		const buildExecutor: BuildExecutor = {
			build: async (options: { outdir?: string; naming?: string; plugins?: Array<{ name: string }> }) => {
				observedPlugins.push((options.plugins ?? []).map((plugin) => plugin.name));
				const naming = String(options.naming ?? 'index.[ext]');
				const compiledOutputPath = path.join(String(options.outdir), naming.replace('[ext]', 'mjs'));

				fs.mkdirSync(path.dirname(compiledOutputPath), { recursive: true });
				fs.writeFileSync(compiledOutputPath, 'export default { ok: true };', 'utf8');

				return {
					success: true,
					logs: [],
					outputs: [{ path: compiledOutputPath }],
				};
			},
		};

		const appConfig = {
			rootDir,
			absolutePaths: {
				projectDir: rootDir,
				srcDir: path.join(rootDir, 'src'),
				componentsDir: path.join(rootDir, 'src', 'components'),
				includesDir: path.join(rootDir, 'src', 'includes'),
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir,
			},
			integrations: [],
			loaders: new Map(),
			templatesExt: ['.tsx'],
			runtime: {},
		} as any;

		setAppBuildManifest(appConfig, {
			loaderPlugins: [],
			runtimePlugins: [{ name: 'react-mdx-loader', setup() {} }],
			browserBundlePlugins: [],
			browserRuntimeManifest: { assets: [], bySpecifier: new Map() },
		});

		try {
			await getAppModuleLoader(appConfig).importModule({
				filePath: pageFilePath,
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
				buildExecutor,
			});

			assert.deepEqual(observedPlugins, [['ecopages-alias-resolver', 'react-mdx-loader']]);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('defaults app module imports to the route-module build executor', async () => {
		const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-app-module-route-executor-'));
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		const pageFilePath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(pageFilePath, 'export default { ok: true };', 'utf8');

		const observedExecutors: BuildExecutor[] = [];
		const appConfig = {
			rootDir,
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				componentsDir: path.join(rootDir, 'src', 'components'),
				includesDir: path.join(rootDir, 'src', 'includes'),
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir,
			},
			integrations: [],
			loaders: new Map(),
			templatesExt: ['.tsx'],
			runtime: {},
		} as any;

		setAppBuildAdapter(appConfig, new RolldownBuildAdapter());
		setAppBuildManifest(appConfig, {
			loaderPlugins: [],
			runtimePlugins: [],
			browserBundlePlugins: [],
			browserRuntimeManifest: { assets: [], bySpecifier: new Map() },
		});
		installBuildRuntime(appConfig);
		const routeModuleExecutor = appConfig.runtime.buildRuntime.getProfile('route-module');
		const originalBuild = routeModuleExecutor.build.bind(routeModuleExecutor);
		routeModuleExecutor.build = async (options: Parameters<BuildExecutor['build']>[0]) => {
			observedExecutors.push(routeModuleExecutor);
			return originalBuild(options);
		};

		try {
			await getAppModuleLoader(appConfig).importModule({
				filePath: pageFilePath,
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
			});

			assert.deepEqual(observedExecutors, [routeModuleExecutor]);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
