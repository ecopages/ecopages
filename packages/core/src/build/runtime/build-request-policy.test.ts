import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { createAppBuildManifest } from '../contracts/build-manifest.ts';
import {
	createBrowserBuildRequest,
	createServerBuildRequest,
	mergeCallerBuildPlugins,
	resolveAppBuildPlugins,
	resolveBuildPluginOrder,
} from './build-request-policy.ts';
import { createBuildSuccess } from '../../__fixtures__/build/build-result.ts';
import { createBrowserRuntimeManifest } from '../browser/browser-runtime-manifest.ts';
import { RolldownBuildAdapter } from '../rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../build-log.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';

function createAppConfig(): EcoPagesAppConfig {
	const appPlugin: EcoBuildPlugin = { name: 'app-plugin', setup() {} };
	const browserPlugin: EcoBuildPlugin = { name: 'browser-plugin', environments: ['browser'], setup() {} };
	const buildManifest = createAppBuildManifest(
		[appPlugin, browserPlugin].map((plugin) => ({ plugin, source: plugin.name })),
	);

	return {
		rootDir: '/app',
		loaders: new Map(),
		appRuntime: {
			buildManifest,
		},
		absolutePaths: {
			projectDir: '/app',
		},
		integrations: [],
	} as unknown as EcoPagesAppConfig;
}

test('resolveAppBuildPlugins throws when the config was never assembled', () => {
	assert.throws(
		() => resolveAppBuildPlugins({ loaders: new Map() } as unknown as EcoPagesAppConfig, 'server'),
		/Missing app runtime\. This config was never assembled\./,
	);
});

test('mergeCallerBuildPlugins keeps app plugins on collision and prepends unique callers', () => {
	const appPlugin: EcoBuildPlugin = { name: 'shared', setup() {} };
	const collidingCaller: EcoBuildPlugin = {
		name: 'shared',
		setup(build) {
			build.onLoad({ filter: /\.ts$/u }, () => undefined);
		},
	};
	const uniqueCaller: EcoBuildPlugin = { name: 'caller-first', setup() {} };

	const merged = mergeCallerBuildPlugins([appPlugin], [collidingCaller, uniqueCaller]);

	assert.equal(merged.length, 2);
	assert.equal(merged[0]?.name, 'caller-first');
	assert.equal(merged[1]?.name, 'shared');
	assert.equal(merged[1]?.setup, appPlugin.setup);
});

test('createServerBuildRequest omits the import.meta source rewrite in production', () => {
	vi.stubEnv('NODE_ENV', 'production');
	try {
		const request = createServerBuildRequest(createAppConfig(), {
			entrypoints: ['/app/app.ts'],
			outdir: '/out',
		});

		assert.equal(
			request.plugins?.some((plugin) => plugin.name === 'preserve-import-meta-for-server-output'),
			false,
		);
	} finally {
		vi.unstubAllEnvs();
	}
});

test('createServerBuildRequest includes app server plugins and jsx ownership', () => {
	const appConfig = createAppConfig();
	const callerPlugin: EcoBuildPlugin = { name: 'caller-plugin', setup() {} };

	const request = createServerBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
		plugins: [callerPlugin],
	});

	assert.ok(request.plugins?.some((plugin) => plugin.name === 'app-plugin'));
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'caller-plugin'));
	assert.equal(request.plugins?.[0]?.name, 'caller-plugin');
	assert.equal(request.environment, 'server');
	assert.equal(request.target, 'node');
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'preserve-import-meta-for-server-output'));
});

test('createServerBuildRequest keeps import.meta at the source for the directory the output runs from', async () => {
	const appConfig = createAppConfig();
	const transformFor = async (input: { runtimeOutdir?: string }) => {
		const request = createServerBuildRequest(appConfig, {
			entrypoints: ['/app/src/pages/index.ts'],
			outdir: '/app/.eco/.server-modules',
			...input,
		});
		const plugin = request.plugins?.find(
			(candidate) => candidate.name === 'preserve-import-meta-for-server-output',
		);
		let transform: ((code: string, id: string) => unknown) | undefined;
		await plugin?.setup({
			onResolve() {},
			onLoad() {},
			module() {},
			transform(_options, callback) {
				transform = callback;
			},
		});
		const result = await transform?.('export const url = import.meta.url;', '/app/src/pages/index.ts');
		return typeof result === 'object' && result && 'code' in result ? result.code : result;
	};

	assert.match(String(await transformFor({})), /new URL\("\.\.\/\.\.\/src\/pages\/index\.ts", import\.meta\.url\)/u);
	assert.match(
		String(await transformFor({ runtimeOutdir: '/app/.server' })),
		/new URL\("\.\.\/src\/pages\/index\.ts", import\.meta\.url\)/u,
	);
});

test('a server request reports packages outside the app root only when asked to', () => {
	const appConfig = createAppConfig();
	const request = (extra: { reportPackagesOutsideRoot?: boolean }) =>
		createServerBuildRequest(appConfig, { ...extra, entrypoints: ['/app/app.ts'], outdir: '/out' });

	assert.equal(request({ reportPackagesOutsideRoot: true }).reportPackagesOutsideRoot, true);
	assert.equal(request({}).reportPackagesOutsideRoot, undefined);
});

test('server requests take the server environment defaults', () => {
	const request = createServerBuildRequest(createAppConfig(), { entrypoints: ['/app/app.ts'], outdir: '/out' });

	assert.equal(request.target, 'node');
	assert.equal(request.format, 'esm');
	assert.equal(request.sourcemap, 'none');
	assert.equal(request.minify, false);
	assert.equal(request.externalPackages, true);
});

test('resolveAppBuildPlugins matches createServerBuildRequest app plugin set', () => {
	const appConfig = createAppConfig();
	const request = createServerBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/pages/index.tsx'],
		outdir: '/out',
	});

	assert.deepEqual(
		request.plugins
			?.map((plugin) => plugin.name)
			.filter(
				(name) =>
					name !== 'preserve-import-meta-for-server-output' && name !== 'eco-component-identity-attribution',
			),
		resolveAppBuildPlugins(appConfig, 'server').map((plugin) => plugin.name),
	);
	assert.ok(request.plugins?.some((plugin) => plugin.name === 'preserve-import-meta-for-server-output'));
});

test('createBrowserBuildRequest excludes app plugins by name and attaches core transforms as plugins', () => {
	const appConfig = createAppConfig();

	const request = createBrowserBuildRequest(appConfig, {
		environment: 'server' as const,
		entrypoints: ['/app/client.ts'],
		outdir: '/out',
		excludeAppBuildPlugins: ['browser-plugin'],
	});

	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'browser-plugin'));
	assert.equal(request.target, 'browser');
});

test('browser compilation on the route-module executor keeps browser defaults and filters caller plugins', async () => {
	const appConfig = createAppConfig();
	const request = createBrowserBuildRequest(appConfig, {
		entrypoints: ['/app/client.ts'],
		plugins: [{ name: 'server-only', environments: ['server'], setup() {} }],
	});
	assert.equal(request.environment, 'browser');
	assert.equal(request.target, 'browser');
	assert.equal(request.format, 'esm');
	assert.ok(request.plugins?.every((plugin) => plugin.name !== 'server-only'));
	const { BuildQueue } = await import('./build-queue.ts');
	const observed: import('../contracts/build-contracts.ts').BuildOptions[] = [];
	const queue = new BuildQueue({
		async build(options) {
			observed.push(options);
			return createBuildSuccess();
		},
		resolve(specifier) {
			return specifier;
		},
	});
	await queue.build(request);
	assert.equal(observed[0]?.environment, 'browser');
	assert.equal(observed[0]?.target, 'browser');
});

function createOrderedAppConfig(): EcoPagesAppConfig {
	const named = (name: string, environments?: Array<'server' | 'browser'>): EcoBuildPlugin => ({
		name,
		environments,
		setup() {},
	});
	const buildManifest = createAppBuildManifest(
		[named('browser-only', ['browser']), named('shared'), named('server-only', ['server'])].map((plugin) => ({
			plugin,
			source: plugin.name,
		})),
		createBrowserRuntimeManifest([
			{
				specifier: 'react',
				owner: '@ecopages/react',
				importPath: 'react',
				publicPath: '/assets/vendors/react.js',
			},
		]),
	);
	return {
		rootDir: '/app',
		loaders: new Map(),
		appRuntime: {
			buildManifest,
		},
		absolutePaths: { projectDir: '/app' },
		integrations: [{ name: 'react', extensions: ['.tsx'], jsxImportSource: 'react' }],
	} as unknown as EcoPagesAppConfig;
}

test('resolveBuildPluginOrder lists every plugin of a server request in hook order', () => {
	const order = resolveBuildPluginOrder(createOrderedAppConfig(), 'server', {
		callerPlugins: [
			{ name: 'caller', setup() {} },
			{ name: 'caller-browser-only', environments: ['browser'], setup() {} },
		],
		coreTransforms: [{ name: 'core-transform', setup() {} }],
	});

	assert.deepEqual(
		order.map((plugin) => plugin.name),
		[
			'caller',
			'ecopages-alias-resolver',
			'shared',
			'server-only',
			'ecopages-jsx-ownership-react--tsx',
			'eco-component-identity-attribution',
			'core-transform',
		],
	);
});

test('resolveBuildPluginOrder lists every plugin of a browser request in hook order', () => {
	const order = resolveBuildPluginOrder(createOrderedAppConfig(), 'browser', {
		callerPlugins: [{ name: 'caller', setup() {} }],
		excludeAppBuildPlugins: ['shared'],
	});

	assert.deepEqual(
		order.map((plugin) => plugin.name),
		[
			'caller',
			'ecopages-alias-resolver',
			'browser-runtime-plugin',
			'browser-only',
			'ecopages-jsx-ownership-react--tsx',
			'eco-component-identity-attribution',
		],
	);
});

test('resolveBuildPluginOrder lets an app plugin keep its place against a caller plugin of the same name', () => {
	const caller: EcoBuildPlugin = { name: 'shared', setup() {} };

	const order = resolveBuildPluginOrder(createOrderedAppConfig(), 'server', {
		callerPlugins: [caller],
	});

	assert.equal(order.filter((plugin) => plugin.name === 'shared').length, 1);
	assert.ok(!order.includes(caller));
});

test('resolveBuildPluginOrder throws instead of running a core transform next to a plugin of its name', () => {
	const appConfig = createOrderedAppConfig();

	assert.throws(
		() =>
			resolveBuildPluginOrder(appConfig, 'server', {
				callerPlugins: [{ name: 'caller', setup() {} }],
				coreTransforms: [{ name: 'shared', setup() {} }],
			}),
		/Core transform "shared" has the name of a build plugin of the same request/,
	);
});

test('createBrowserBuildRequest drops runtime manifest specifiers from external and keeps the rest', () => {
	const appConfig = createOrderedAppConfig();

	const request = createBrowserBuildRequest(appConfig, {
		entrypoints: ['/app/client.ts'],
		external: ['react', 'left-pad'],
	});

	assert.deepEqual(request.external, ['left-pad']);
});

test('browser builds inline the runtime mode used by browser environment helpers', async () => {
	const appConfig = createOrderedAppConfig();
	const dir = mkdtempSync(path.join(tmpdir(), 'ecopages-browser-runtime-mode-'));
	vi.stubEnv('NODE_ENV', 'production');
	try {
		const request = createBrowserBuildRequest(appConfig, {
			entrypoints: [path.resolve('packages/core/src/browser-env.ts')],
			outdir: path.join(dir, 'dist'),
			root: process.cwd(),
			plugins: [],
		});
		assert.equal(request.define?.['import.meta.env.NODE_ENV'], '"production"');

		const result = await new RolldownBuildAdapter().build(request);
		assertBuildSucceeded(result, 'Build failed');
		const code = readFileSync(result.outputs[0]!.path, 'utf-8');
		assert.match(code, /"production"/u);
		assert.doesNotMatch(code, /import\.meta\.env/u);
	} finally {
		vi.unstubAllEnvs();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a browser build maps an entry that lists a manifest specifier as external to its public URL', async () => {
	const appConfig = createOrderedAppConfig();
	const dir = mkdtempSync(path.join(tmpdir(), 'ecopages-external-manifest-'));
	try {
		writeFileSync(path.join(dir, 'entry.ts'), "import React from 'react';\nexport const value = React;\n");
		const request = createBrowserBuildRequest(appConfig, {
			entrypoints: [path.join(dir, 'entry.ts')],
			outdir: path.join(dir, 'dist'),
			root: dir,
			external: ['react'],
			plugins: [],
		});

		const result = await new RolldownBuildAdapter().build({
			...request,
			plugins: request.plugins?.filter((plugin) => plugin.name === 'browser-runtime-plugin'),
		});

		assertBuildSucceeded(result, 'Build failed');
		assert.match(readFileSync(result.outputs[0]!.path, 'utf-8'), /from ['"]\/assets\/vendors\/react\.js['"]/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('server and browser builds of one file give each declaration the same component id', async () => {
	const appConfig = createOrderedAppConfig();
	const dir = mkdtempSync(path.join(tmpdir(), 'ecopages-identity-parity-'));
	try {
		const entry = path.join(dir, 'widgets.tsx');
		writeFileSync(
			entry,
			[
				"import { eco } from '@ecopages/core';",
				"export const Counter = eco.component({ render: () => 'counter' });",
				"export const Cart = eco.component({ render: () => 'cart' });",
			].join('\n'),
		);
		const buildIds = async (environment: 'server' | 'browser'): Promise<string[]> => {
			const input = {
				entrypoints: [entry],
				outdir: path.join(dir, environment),
				root: dir,
				external: ['@ecopages/core'],
			};
			const request =
				environment === 'server'
					? createServerBuildRequest(appConfig, input)
					: createBrowserBuildRequest(appConfig, input);
			const result = await new RolldownBuildAdapter().build(request);
			assertBuildSucceeded(result, `${environment} build failed`);
			const code = readFileSync(result.outputs[0]!.path, 'utf-8');
			return [...code.matchAll(/bindComponentIdentity\(\{\s*id: "([a-z0-9]+)"/gu)].map((match) => match[1]!);
		};

		const serverIds = await buildIds('server');

		assert.equal(new Set(serverIds).size, 2);
		assert.deepEqual(await buildIds('browser'), serverIds);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
