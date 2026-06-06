import assert from 'node:assert/strict';
import path from 'node:path';

import type { PluginBuild } from 'esbuild';
import { test } from 'vitest';
import { createEsbuildPluginBridge } from './esbuild-plugin-bridge.ts';
import type { EcoBuildPlugin } from './build-types.ts';

type OnResolveArgs = { path: string; importer?: string; namespace?: string };
type OnLoadArgs = { path: string; namespace?: string };

type ResolveHandler = (args: OnResolveArgs) => Promise<unknown> | unknown;
type LoadHandler = (args: OnLoadArgs) => Promise<unknown> | unknown;

function createFakeEsbuildBuild() {
	const resolveHandlers: Array<{ options: { filter: RegExp; namespace?: string }; callback: ResolveHandler }> = [];
	const loadHandlers: Array<{ options: { filter: RegExp; namespace?: string }; callback: LoadHandler }> = [];

	const build = {
		onResolve(options: { filter: RegExp; namespace?: string }, callback: ResolveHandler) {
			resolveHandlers.push({ options, callback });
		},
		onLoad(options: { filter: RegExp; namespace?: string }, callback: LoadHandler) {
			loadHandlers.push({ options, callback });
		},
	};

	return { build, resolveHandlers, loadHandlers };
}

test('createEsbuildPluginBridge returns a named esbuild plugin', () => {
	const bridge = createEsbuildPluginBridge([], '/app');
	assert.equal(bridge.name, 'ecopages-plugin-bridge');
});

test('createEsbuildPluginBridge runs each supplied plugin.setup with a builder', async () => {
	const setupCalls: string[] = [];
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'first',
			setup(build) {
				setupCalls.push('first');
				build.onResolve({ filter: /.*/ }, () => ({ path: 'mapped', external: true }));
			},
		},
		{
			name: 'second',
			setup(build) {
				setupCalls.push('second');
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'rewritten', loader: 'js' }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);
	assert.deepEqual(setupCalls, ['first', 'second'], 'plugins run in array order');
	assert.equal(fake.resolveHandlers.length, 1, 'first plugin registered onResolve');
	assert.equal(fake.loadHandlers.length, 1, 'second plugin registered onLoad');
});

test('createEsbuildPluginBridge translates onResolve results to esbuild shape', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'alias',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/vendor/react.js', external: true }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'react', importer: '/app/index.ts' });
	assert.deepEqual(result, { path: '/vendor/react.js', external: true });
});

test('createEsbuildPluginBridge resolves relative paths against the importer', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'relative',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: './sibling.ts' }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X', importer: '/app/sub/index.ts' });
	assert.equal(result && (result as { path: string }).path, path.resolve('/app/sub', './sibling.ts'));
});

test('createEsbuildPluginBridge leaves absolute resolve paths untouched', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'absolute',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/abs/path.ts' }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X' });
	assert.equal(result && (result as { path: string }).path, '/abs/path.ts');
});

test('createEsbuildPluginBridge returns undefined when resolve callback returns undefined', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X' });
	assert.equal(result, undefined);
});

test('createEsbuildPluginBridge translates onLoad results with inferred loader', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'rewrite',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'export const x = 1;', loader: 'tsx' }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.loadHandlers[0]?.callback({ path: '/app/index.tsx' });
	assert.deepEqual(result, {
		contents: 'export const x = 1;',
		loader: 'tsx',
		resolveDir: '/app',
	});
});

test('createEsbuildPluginBridge onLoad synthesizes a module source from exports', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'exports',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({
					loader: 'object' as never,
					exports: { default: 'hello', named: 42 },
				}));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = (await fake.loadHandlers[0]?.callback({ path: '/app/data.json' })) as {
		contents: string;
		loader: string;
	};
	assert.equal(result.loader, 'js');
	assert.match(result.contents, /export default "hello";/);
	assert.match(result.contents, /export const named = 42;/);
});

test('createEsbuildPluginBridge onLoad returns undefined for empty results', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	const result = await fake.loadHandlers[0]?.callback({ path: '/app/index.ts' });
	assert.equal(result, undefined);
});

test('createEsbuildPluginBridge module registers a unique namespace per specifier', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'mod1',
			setup(build) {
				build.module('virtual:foo', () => ({ contents: 'foo', loader: 'js' }));
			},
		},
		{
			name: 'mod2',
			setup(build) {
				build.module('virtual:bar', () => ({ contents: 'bar', loader: 'js' }));
			},
		},
	];

	const bridge = createEsbuildPluginBridge(plugins, '/app');
	const fake = createFakeEsbuildBuild();
	await bridge.setup(fake.build as unknown as PluginBuild);

	assert.equal(fake.resolveHandlers.length, 2);
	assert.equal(fake.loadHandlers.length, 2);
	const loadNamespaces = fake.loadHandlers.map((entry) => entry.options.namespace);
	assert.ok(loadNamespaces[0], 'first module has a load namespace');
	assert.ok(loadNamespaces[1], 'second module has a load namespace');
	assert.notEqual(loadNamespaces[0], loadNamespaces[1], 'namespaces are unique');

	const resolveResults = await Promise.all(fake.resolveHandlers.map((entry) => entry.callback({ path: 'X' })));
	assert.equal((resolveResults[0] as { namespace: string }).namespace, loadNamespaces[0]);
	assert.equal((resolveResults[1] as { namespace: string }).namespace, loadNamespaces[1]);
});
