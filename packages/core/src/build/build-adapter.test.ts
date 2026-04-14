import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import {
	build,
	collectConfiguredAppBuildManifestContributions,
	createConfiguredAppBuildManifest,
	createBuildAdapter,
	createBunBuildAdapter,
	defaultBunBuildAdapter,
	defaultBuildAdapter,
	EsbuildBuildAdapter,
	getAppBuildOwnership,
	getAppBuildAdapter,
	getAppBuildManifest,
	getAppBrowserBuildPlugins,
	getAppBuildExecutor,
	getDefaultBuildAdapter,
	getAppServerBuildPlugins,
	setAppBuildAdapter,
	setAppBuildOwnership,
	setAppBuildManifest,
	setupAppRuntimePlugins,
	updateAppBuildManifest,
	ViteHostBuildAdapter,
} from './build-adapter.ts';
import { createAppBuildManifest } from './build-manifest.ts';
import type { EcoBuildPluginBuilder } from './build-types.ts';
import { createAppBuildExecutor } from './dev-build-coordinator.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

function cleanupTempRoots(): void {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function clearNodeCssBridge(): void {
	return;
}

test('defaultBuildAdapter remains the Bun-native fallback backed by the Bun adapter', () => {
	assert.equal(defaultBuildAdapter, defaultBunBuildAdapter);
	assert.ok(!(defaultBuildAdapter instanceof EsbuildBuildAdapter));
	assert.equal(defaultBuildAdapter.ownership, 'bun-native');
});

test('createBuildAdapter makes Bun-native and Vite-host ownership explicit', () => {
	const bunAdapter = createBuildAdapter({ ownership: 'bun-native' });
	const viteAdapter = createBuildAdapter({ ownership: 'vite-host' });
	const defaultViteAdapter = getDefaultBuildAdapter('vite-host');

	assert.ok(!(bunAdapter instanceof EsbuildBuildAdapter));
	assert.equal(bunAdapter.ownership, 'bun-native');
	assert.ok(viteAdapter instanceof ViteHostBuildAdapter);
	assert.equal(viteAdapter.ownership, 'vite-host');
	assert.ok(defaultViteAdapter instanceof ViteHostBuildAdapter);
	assert.equal(defaultViteAdapter.ownership, 'vite-host');
});

test('ViteHostBuildAdapter rejects core-owned execution attempts', async () => {
	const adapter = new ViteHostBuildAdapter();

	await assert.rejects(
		adapter.build({
			entrypoints: ['/tmp/entry.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
		/Vite-hosted builds are owned by the host runtime/,
	);
	assert.throws(() => adapter.resolve('react', '/tmp'), /Vite-hosted builds are owned by the host runtime/);
	assert.throws(
		() => adapter.getTranspileOptions('browser-script'),
		/Vite-hosted builds are owned by the host runtime/,
	);
});

test('build helper accepts an explicit executor across package and relative build-adapter imports', async () => {
	const packageBuildAdapter = await import('@ecopages/core/build/build-adapter');
	const executor = {
		build: vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/shared.js' }],
		})),
	};

	const result = await packageBuildAdapter.build(
		{
			entrypoints: ['/tmp/shared.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		},
		executor,
	);

	assert.equal(result.success, true);
	assert.deepEqual(result.outputs, [{ path: '/tmp/shared.js' }]);
	assert.equal(executor.build.mock.calls.length, 1);
});

test('build helper uses the shared adapter when no executor is provided', async () => {
	const executor = {
		build: vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/direct.js' }],
		})),
	};
	const adapterSpy = vi.spyOn(defaultBuildAdapter, 'build').mockImplementation(executor.build);

	const result = await build({
		entrypoints: ['/tmp/direct.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
		splitting: false,
		minify: false,
	});

	assert.equal(result.success, true);
	assert.deepEqual(result.outputs, [{ path: '/tmp/direct.js' }]);
	assert.equal(adapterSpy.mock.calls.length, 1);
});

test('BunBuildAdapter bundles entrypoints by default to keep transitive app imports in the emitted server module', async () => {
	const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
	const buildCalls: Array<Record<string, unknown>> = [];

	(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {
		build: vi.fn(async (options: Record<string, unknown>) => {
			buildCalls.push(options);
			return {
				success: true,
				logs: [],
				outputs: [{ path: '/tmp/out/entry.js' }],
			};
		}),
		hash: vi.fn(() => 1),
		resolveSync: vi.fn((importPath: string) => importPath),
	};

	try {
		const freshAdapter = createBunBuildAdapter();
		const result = await freshAdapter.build({
			entrypoints: ['/tmp/entry.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: true,
			minify: false,
		});

		assert.equal(result.success, true);
		assert.equal(buildCalls.length, 1);
		assert.equal(buildCalls[0]?.bundle, undefined);
	} finally {
		if (originalBun === undefined) {
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
		} else {
			(globalThis as typeof globalThis & { Bun?: unknown }).Bun = originalBun;
		}
	}
});

test('BunBuildAdapter normalizes hashed naming patterns to concrete emitted output files', async () => {
	const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;

	try {
		const root = createTempRoot('ecopages-bun-naming-template');
		const srcDir = path.join(root, 'src', 'components');
		const outDir = path.join(root, 'dist', 'assets', 'components');
		fs.mkdirSync(srcDir, { recursive: true });
		fs.mkdirSync(outDir, { recursive: true });

		const entryPath = path.join(srcDir, 'kita-counter.script.ts');
		fs.writeFileSync(entryPath, 'export const value = 1;');

		const concreteOutputPath = path.join(outDir, 'kita-counter.script-abc123.js');
		const placeholderOutputPath = path.join(outDir, 'kita-counter.script-[hash].js');

		(globalThis as typeof globalThis & { Bun?: unknown }).Bun = {
			build: vi.fn(async () => {
				fs.writeFileSync(concreteOutputPath, 'export const value = 1;', 'utf8');
				return {
					success: true,
					logs: [],
					outputs: [{ path: placeholderOutputPath }],
				};
			}),
			hash: vi.fn(() => 1),
			resolveSync: vi.fn((importPath: string) => importPath),
		};

		const freshAdapter = createBunBuildAdapter();
		const result = await freshAdapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: true,
			minify: false,
			naming: '[name]-[hash].[ext]',
		});

		assert.equal(result.success, true);
		assert.deepEqual(result.outputs, [{ path: concreteOutputPath }]);
		assert.equal(fs.existsSync(concreteOutputPath), true);
		assert.equal(fs.existsSync(placeholderOutputPath), false);
	} finally {
		if (originalBun === undefined) {
			delete (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
		} else {
			(globalThis as typeof globalThis & { Bun?: unknown }).Bun = originalBun;
		}
	}
});

test('getAppBuildExecutor falls back to the app-owned adapter before the shared default adapter', async () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as any;
	const appAdapter = new EsbuildBuildAdapter();

	setAppBuildAdapter(appConfig, appAdapter);

	assert.equal(getAppBuildAdapter(appConfig), appAdapter);
	assert.equal(getAppBuildExecutor(appConfig), appAdapter);
	assert.equal(getAppBuildOwnership(appConfig), 'bun-native');
	assert.notEqual(getAppBuildAdapter(appConfig), defaultBuildAdapter);
});

test('getAppBuildAdapter falls back to the explicit Vite-host adapter when ownership is host-owned', () => {
	const appConfig = {
		runtime: {},
		loaders: new Map(),
	} as any;

	setAppBuildOwnership(appConfig, 'vite-host');

	assert.equal(getAppBuildOwnership(appConfig), 'vite-host');
	assert.ok(getAppBuildAdapter(appConfig) instanceof ViteHostBuildAdapter);
});

test('createAppBuildExecutor injects app-owned plugins into builds', async () => {
	const plugin = {
		name: 'app-owned-plugin',
		setup() {},
	};
	const adapter = {
		build: vi.fn(async (options) => ({
			success: true,
			logs: [],
			outputs: [{ path: options.outdir ? `${options.outdir}/entry.js` : '/tmp/entry.js' }],
		})),
		resolve: vi.fn(),
		registerPlugin: vi.fn(),
		getTranspileOptions: vi.fn(),
	};
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as any;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			runtimePlugins: [plugin],
		}),
	);
	const executor = createAppBuildExecutor({
		development: false,
		adapter,
		getPlugins: () => getAppServerBuildPlugins(appConfig),
	});

	await executor.build({
		entrypoints: ['/tmp/entry.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
		splitting: false,
		minify: false,
	});

	assert.equal(adapter.build.mock.calls.length, 1);
	assert.deepEqual(adapter.build.mock.calls[0][0].plugins, [plugin]);
	assert.equal(adapter.registerPlugin.mock.calls.length, 0);
});

test('build manifest separates server and browser plugin sets', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		loaders: new Map(),
		runtime: {},
	} as any;

	setAppBuildManifest(
		appConfig,
		createAppBuildManifest({
			loaderPlugins: [loaderPlugin],
			runtimePlugins: [runtimePlugin],
			browserBundlePlugins: [browserPlugin],
		}),
	);

	assert.deepEqual(getAppBuildManifest(appConfig).loaderPlugins, [loaderPlugin]);
	assert.deepEqual(getAppServerBuildPlugins(appConfig), [loaderPlugin, runtimePlugin]);
	assert.deepEqual(getAppBrowserBuildPlugins(appConfig), [loaderPlugin, runtimePlugin, browserPlugin]);
});

test('createConfiguredAppBuildManifest defaults loader plugins from app config', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {},
	} as any;

	const manifest = createConfiguredAppBuildManifest(appConfig, {
		runtimePlugins: [runtimePlugin],
	});

	assert.deepEqual(manifest.loaderPlugins, [loaderPlugin]);
	assert.deepEqual(manifest.runtimePlugins, [runtimePlugin]);
	assert.deepEqual(manifest.browserBundlePlugins, []);
});

test('updateAppBuildManifest rebuilds the app manifest from config-owned loaders and explicit runtime plugins', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {},
	} as any;

	updateAppBuildManifest(appConfig, {
		runtimePlugins: [runtimePlugin],
		browserBundlePlugins: [browserPlugin],
	});

	assert.deepEqual(getAppBuildManifest(appConfig).loaderPlugins, [loaderPlugin]);
	assert.deepEqual(getAppServerBuildPlugins(appConfig), [loaderPlugin, runtimePlugin]);
	assert.deepEqual(getAppBrowserBuildPlugins(appConfig), [loaderPlugin, runtimePlugin, browserPlugin]);
});

test('collectConfiguredAppBuildManifestContributions gathers processor and integration contributions during config build', async () => {
	const contributionOrder: string[] = [];
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const processorBrowserPlugin = { name: 'processor-browser-plugin', setup() {} };
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		plugins: [processorRuntimePlugin],
		buildPlugins: [processorBrowserPlugin],
		prepareBuildContributions: vi.fn(async () => {
			contributionOrder.push('processor-prepare');
		}),
	};
	const integration = {
		plugins: [integrationRuntimePlugin],
		setConfig: vi.fn(() => contributionOrder.push('integration-config')),
		prepareBuildContributions: vi.fn(async () => {
			contributionOrder.push('integration-prepare');
		}),
	};

	const contributions = await collectConfiguredAppBuildManifestContributions({
		processors: new Map([['processor', processor]]),
		integrations: [integration],
	} as any);

	assert.deepEqual(contributionOrder, ['processor-prepare', 'integration-config', 'integration-prepare']);
	assert.deepEqual(contributions.runtimePlugins, [processorRuntimePlugin, integrationRuntimePlugin]);
	assert.deepEqual(contributions.browserBundlePlugins, [processorBrowserPlugin]);
});

test('setupAppRuntimePlugins runs runtime setup without recomposing manifest contributions', async () => {
	const contributionOrder: string[] = [];
	const processorRuntimePlugin = { name: 'processor-runtime-plugin', setup() {} };
	const integrationRuntimePlugin = { name: 'integration-runtime-plugin', setup() {} };
	const processor = {
		plugins: [processorRuntimePlugin],
		setup: vi.fn(async () => {
			contributionOrder.push('processor-setup');
		}),
	};
	const integration = {
		plugins: [integrationRuntimePlugin],
		setConfig: vi.fn(() => contributionOrder.push('integration-config')),
		setRuntimeOrigin: vi.fn(() => contributionOrder.push('integration-origin')),
		setHmrManager: vi.fn(() => contributionOrder.push('integration-hmr')),
		setup: vi.fn(async () => {
			contributionOrder.push('integration-setup');
		}),
	};
	const observedRuntimePlugins: string[] = [];

	await setupAppRuntimePlugins({
		appConfig: {
			processors: new Map([['processor', processor]]),
			integrations: [integration],
		} as any,
		runtimeOrigin: 'http://localhost:3000',
		hmrManager: {} as any,
		onRuntimePlugin: (plugin) => observedRuntimePlugins.push(plugin.name),
	});

	assert.deepEqual(contributionOrder, [
		'processor-setup',
		'integration-config',
		'integration-origin',
		'integration-hmr',
		'integration-setup',
	]);
	assert.deepEqual(observedRuntimePlugins, ['processor-runtime-plugin', 'integration-runtime-plugin']);
});

test('EsbuildBuildAdapter supports module virtual modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-virtual-module');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, "import answer from 'virtual:answer';\nexport const value = answer;");

		const adapter = new EsbuildBuildAdapter();

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			plugins: [
				{
					name: 'virtual-module-test',
					setup(build: EcoBuildPluginBuilder) {
						build.module('virtual:answer', () => ({
							loader: 'object',
							exports: {
								default: 42,
							},
						}));
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /42/);
	} finally {
		cleanupTempRoots();
	}
});

test('EsbuildBuildAdapter applies build plugin CSS transforms to imported CSS strings', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-css');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			plugins: [
				{
					name: 'css-bridge-replacement-test',
					setup(build) {
						build.onLoad({ filter: /\.css$/ }, async (args) => {
							const contents = fs.readFileSync(args.path, 'utf-8');
							return {
								loader: 'object',
								exports: {
									default: `/* transformed */\n${contents}`,
								},
							};
						});
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /\/\* transformed \*\//);
		assert.match(outputSource, /\.counter \{ color: red; \}/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter resolves tsconfig path aliases', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-tsconfig-paths');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		const libDir = path.join(srcDir, 'lib');
		fs.mkdirSync(libDir, { recursive: true });

		const tsconfigPath = path.join(root, 'tsconfig.json');
		fs.writeFileSync(
			tsconfigPath,
			JSON.stringify({
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@/*': ['src/*'],
					},
				},
			}),
		);

		const utilPath = path.join(libDir, 'count.ts');
		fs.writeFileSync(utilPath, 'export const count = 7;');

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, "import { count } from '@/lib/count';\nexport const value = count;");

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /7/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter compiles decorated classes without legacy mode', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-decorated-declare');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'function sealed<T extends new (...args: never[]) => object>(value: T) {',
				'\treturn value;',
				'}',
				'@sealed',
				'class Counter {}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter compiles decorated accessor fields', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-decorated-accessor');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'function property(_options: unknown) {',
				'\treturn function (_target: unknown, _context: unknown) {};',
				'}',
				'class Counter {',
				'\t@property({ type: Number }) accessor count = 0;',
				'}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter downlevels accessor fields for browser target bundles', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-browser-accessor');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'class Counter {',
				'\taccessor count = 0;',
				'}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.doesNotMatch(outputSource, /accessor\s+count/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter applies plugin CSS transforms for CSS imported in TS modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-plugin-css-transform');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			plugins: [
				{
					name: 'css-transform-test-plugin',
					setup(build) {
						build.onLoad({ filter: /\.css$/ }, async (args) => {
							const contents = fs.readFileSync(args.path, 'utf-8');
							return {
								loader: 'object',
								exports: {
									default: `/* postprocessed */\n${contents}`,
								},
							};
						});
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /\/\* postprocessed \*\//);
		assert.match(outputSource, /\.counter \{ color: red; \}/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter supports synchronous onLoad transforms for entrypoints', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-entrypoint-onload');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.tsx');
		fs.writeFileSync(
			entryPath,
			[
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"export const view = () => _jsx('button', { children: 'ok' });",
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			plugins: [
				{
					name: 'entrypoint-onload-test-plugin',
					setup(build) {
						build.onLoad({ filter: /entry\.tsx$/ }, (args) => ({
							contents: fs.readFileSync(args.path, 'utf-8'),
							loader: 'tsx',
							resolveDir: path.dirname(args.path),
						}));
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /button/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter returns dependency graph entrypoint mapping', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-dependency-graph');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const sharedPath = path.join(srcDir, 'shared.ts');
		const leafPath = path.join(srcDir, 'leaf.ts');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(sharedPath, "import { leaf } from './leaf';\nexport const shared = leaf + 1;");
		fs.writeFileSync(leafPath, 'export const leaf = 2;');
		fs.writeFileSync(entryPath, "import { shared } from './shared';\nexport const value = shared;");

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);
		assert.ok(result.dependencyGraph);

		const dependencies = result.dependencyGraph?.entrypoints[path.resolve(entryPath)] ?? [];

		assert.ok(dependencies.includes(path.resolve(entryPath)));
		assert.ok(dependencies.includes(path.resolve(sharedPath)));
		assert.ok(dependencies.includes(path.resolve(leafPath)));
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter honors first-match plugin precedence within one build', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-plugin-precedence');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			plugins: [
				{
					name: 'first-css-plugin',
					setup(build) {
						build.onLoad({ filter: /\.css$/ }, async () => {
							return {
								loader: 'object',
								exports: {
									default: 'first-css',
								},
							};
						});
					},
				},
				{
					name: 'second-css-plugin',
					setup(build) {
						build.onLoad({ filter: /\.css$/ }, async () => {
							return {
								loader: 'object',
								exports: {
									default: 'second-css',
								},
							};
						});
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /first-css/);
		assert.doesNotMatch(outputSource, /second-css/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter resolves templated naming patterns to concrete output files', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-naming-template');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, 'export const value = 1;');

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: true,
			minify: false,
			naming: '[name].[ext]',
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);
		assert.equal(fs.existsSync(path.join(outDir, '[name].[ext]')), false);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter forwards define replacements into bundled runtime modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-define-runtime');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.js');
		fs.writeFileSync(entryPath, 'export const mode = process.env.NODE_ENV;\n');

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			define: {
				'process.env.NODE_ENV': '"development"',
			},
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /development/);
		assert.doesNotMatch(outputSource, /production/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});
