import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import { EsbuildBuildAdapter } from '../../build/build-adapter.ts';
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

	it('adds the Node bootstrap plugin to app-owned module imports in node runtimes', async () => {
		const calls: Array<unknown> = [];
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			templatesExt: ['.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig) as any;
		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async (options: unknown) => {
			calls.push(options);
			return { default: { ok: true } };
		};

		await moduleLoader.importModule({
			filePath: '/app/src/pages/index.tsx',
			rootDir: '/app',
			outdir: '/app/.eco/.server-modules',
		});

		moduleLoader.pageModuleImportService.importModule = originalImportModule;

		const plugins = (calls[0] as { plugins?: Array<{ name: string }> }).plugins;
		assert.equal(Array.isArray(plugins), true);
		assert.equal(plugins?.[0]?.name, 'node-bootstrap-plugin');
	});

	it('keeps the owning Bun JSX runtime on app-owned module imports after invalidation', async () => {
		(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {};
		const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-app-module-loader-'));
		const includesDir = path.join(rootDir, 'src', 'includes');
		fs.mkdirSync(includesDir, { recursive: true });
		const seoIncludePath = path.join(includesDir, 'seo.kita.tsx');
		fs.writeFileSync(seoIncludePath, 'export const Seo = () => null;', 'utf8');
		const calls: Array<unknown> = [];
		const appConfig = {
			rootDir,
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				componentsDir: path.join(rootDir, 'src', 'components'),
				includesDir,
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir: path.join(rootDir, 'src', 'pages'),
			},
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					jsxImportSource: 'react',
				},
				{
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				},
			],
			templatesExt: ['.tsx', '.kita.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig) as any;
		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async (options: unknown) => {
			calls.push(options);
			return { default: { ok: true } };
		};

		try {
			await moduleLoader.importModule({
				filePath: path.join(rootDir, 'src', 'includes', 'html.kita.tsx'),
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
				invalidationVersion: 1,
			});

			const plugins = (calls[0] as { plugins?: Array<{ name: string; setup: Function }> }).plugins ?? [];
			assert.deepEqual((calls[0] as { jsx?: { importSource?: string; runtime?: string } }).jsx, {
				importSource: '@kitajs/html',
				runtime: 'automatic',
				development: false,
			});
			const jsxOnLoadRegistrations: Array<(args: { path: string }) => { contents?: string } | undefined> = [];
			for (const plugin of plugins.filter((plugin) => plugin.name.startsWith('ecopages-bun-jsx-ownership-'))) {
				plugin.setup({
					onResolve() {},
					onLoad(_options: unknown, callback: (args: { path: string }) => { contents?: string } | undefined) {
						jsxOnLoadRegistrations.push(callback);
					},
					module() {},
				});
			}

			const transformedResults = jsxOnLoadRegistrations
				.map((callback) => callback({ path: seoIncludePath }))
				.filter((result) => result?.contents);
			assert.equal(transformedResults.length, 1);
			const transformed = transformedResults[0];
			assert.equal(transformed?.contents?.startsWith('/** @jsxImportSource @kitajs/html */\n'), true);
		} finally {
			moduleLoader.pageModuleImportService.importModule = originalImportModule;
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('does not let broad JSX ownership overrides claim more specific integration suffixes', async () => {
		(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {};
		const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-app-module-loader-'));
		const includesDir = path.join(rootDir, 'src', 'includes');
		fs.mkdirSync(includesDir, { recursive: true });
		const seoIncludePath = path.join(includesDir, 'seo.kita.tsx');
		fs.writeFileSync(seoIncludePath, 'export const Seo = () => null;', 'utf8');
		const calls: Array<unknown> = [];
		const appConfig = {
			rootDir,
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				componentsDir: path.join(rootDir, 'src', 'components'),
				includesDir,
				layoutsDir: path.join(rootDir, 'src', 'layouts'),
				pagesDir: path.join(rootDir, 'src', 'pages'),
			},
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					jsxImportSource: 'react',
				},
				{
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				},
			],
			templatesExt: ['.tsx', '.kita.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig) as any;
		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async (options: unknown) => {
			calls.push(options);
			return { default: { ok: true } };
		};

		try {
			await moduleLoader.importModule({
				filePath: path.join(rootDir, 'src', 'pages', 'index.kita.tsx'),
				rootDir,
				outdir: path.join(rootDir, '.eco', '.server-modules'),
			});

			const plugins = (calls[0] as { plugins?: Array<{ name: string; setup: Function }> }).plugins ?? [];
			const jsxOnLoadRegistrations: Array<(args: { path: string }) => { contents?: string } | undefined> = [];
			for (const plugin of plugins.filter((plugin) => plugin.name.startsWith('ecopages-bun-jsx-ownership-'))) {
				plugin.setup({
					onResolve() {},
					onLoad(_options: unknown, callback: (args: { path: string }) => { contents?: string } | undefined) {
						jsxOnLoadRegistrations.push(callback);
					},
					module() {},
				});
			}

			const transformedResults = jsxOnLoadRegistrations
				.map((callback) => callback({ path: seoIncludePath }))
				.filter((result) => result?.contents);
			assert.equal(transformedResults.length, 1);
			assert.equal(transformedResults[0]?.contents?.startsWith('/** @jsxImportSource @kitajs/html */\n'), true);
		} finally {
			moduleLoader.pageModuleImportService.importModule = originalImportModule;
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('adds the owning JSX override for Bun app-module builds without invalidation', async () => {
		(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {};
		const calls: Array<unknown> = [];
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				srcDir: '/app/src',
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			integrations: [
				{
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				},
			],
			templatesExt: ['.kita.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig) as any;
		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async (options: unknown) => {
			calls.push(options);
			return { default: { ok: true } };
		};

		try {
			await moduleLoader.importModule({
				filePath: '/app/src/includes/html.kita.tsx',
				rootDir: '/app',
				outdir: '/app/.eco/.server-modules',
			});

			const plugins = (calls[0] as { plugins?: Array<{ name: string }> }).plugins ?? [];
			assert.deepEqual((calls[0] as { jsx?: { importSource?: string; runtime?: string } }).jsx, {
				importSource: '@kitajs/html',
				runtime: 'automatic',
				development: false,
			});
			assert.ok(plugins.find((plugin) => plugin.name.startsWith('ecopages-bun-jsx-ownership-')));
		} finally {
			moduleLoader.pageModuleImportService.importModule = originalImportModule;
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
		}
	});

	it('runs app-owned loader plugins before Bun JSX ownership overrides for framework modules', async () => {
		(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {};
		const calls: Array<unknown> = [];
		const appConfig = {
			rootDir: '/app',
			absolutePaths: {
				srcDir: '/app/src',
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
			},
			integrations: [
				{
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				},
			],
			loaders: new Map([
				[
					'eco-component-meta-plugin',
					{
						name: 'eco-component-meta-plugin',
						setup() {},
					},
				],
			]),
			templatesExt: ['.kita.tsx'],
			runtime: {},
		} as any;

		const moduleLoader = getAppModuleLoader(appConfig) as any;
		const originalImportModule = moduleLoader.pageModuleImportService.importModule.bind(
			moduleLoader.pageModuleImportService,
		);
		moduleLoader.pageModuleImportService.importModule = async (options: unknown) => {
			calls.push(options);
			return { default: { ok: true } };
		};

		try {
			await moduleLoader.importModule({
				filePath: '/app/src/layouts/base-layout.kita.tsx',
				rootDir: '/app',
				outdir: '/app/.eco/.server-modules',
			});

			const pluginNames = ((calls[0] as { plugins?: Array<{ name: string }> }).plugins ?? []).map(
				(plugin) => plugin.name,
			);
			assert.equal(pluginNames[0], 'eco-component-meta-plugin');
			assert.ok(pluginNames.find((name) => name.startsWith('ecopages-bun-jsx-ownership-')));
		} finally {
			moduleLoader.pageModuleImportService.importModule = originalImportModule;
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
		}
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
				buildExecutor: new EsbuildBuildAdapter(),
			});

			const rendered = imported.KitaChild();
			assert.equal(typeof rendered, 'string');
			assert.match(String(rendered), /data-kita-child/);
		} finally {
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
