import assert from 'node:assert/strict';
import path from 'node:path';

import { test } from 'vitest';
import { createBunPluginBridge, type BunPluginBuilderLike } from './bun-plugin-bridge.ts';
import type { EcoBuildPlugin } from './build-types.ts';

type OnResolveArgs = { path: string; importer: string; namespace?: string };
type OnLoadArgs = { path: string; namespace?: string };

type ResolveHandler = (args: OnResolveArgs) => Promise<unknown> | unknown;
type LoadHandler = (args: OnLoadArgs) => Promise<unknown> | unknown;

function createFakeBunBuild() {
	const resolveHandlers: Array<{ options: { filter: RegExp; namespace?: string }; callback: ResolveHandler }> = [];
	const loadHandlers: Array<{ options: { filter: RegExp; namespace?: string }; callback: LoadHandler }> = [];

	const build: BunPluginBuilderLike = {
		onResolve(options, callback) {
			resolveHandlers.push({ options, callback });
		},
		onLoad(options, callback) {
			loadHandlers.push({ options, callback });
		},
	};

	return { build, resolveHandlers, loadHandlers };
}

test('createBunPluginBridge returns a named plugin object', () => {
	const bridge = createBunPluginBridge([], '/app');
	assert.equal(bridge.name, 'ecopages-plugin-bridge');
});

test('createBunPluginBridge runs each supplied plugin.setup with a builder', async () => {
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

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);
	assert.deepEqual(setupCalls, ['first', 'second'], 'plugins run in array order');
	assert.equal(fake.resolveHandlers.length, 1, 'first plugin registered onResolve');
	assert.equal(fake.loadHandlers.length, 1, 'second plugin registered onLoad');
});

test('createBunPluginBridge translates onResolve results to Bun shape', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'alias',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/vendor/react.js', external: true }));
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'react', importer: '/app/index.ts' });
	assert.deepEqual(result, { path: '/vendor/react.js', external: true });
});

test('createBunPluginBridge resolves relative paths against the importer', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'relative',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: './sibling.ts' }));
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X', importer: '/app/sub/index.ts' });
	assert.equal(result && (result as { path: string }).path, path.resolve('/app/sub', './sibling.ts'));
});

test('createBunPluginBridge leaves absolute resolve paths untouched', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'absolute',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/abs/path.ts' }));
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X', importer: '/app/index.ts' });
	assert.equal(result && (result as { path: string }).path, '/abs/path.ts');
});

test('createBunPluginBridge returns undefined when resolve callback returns undefined', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.resolveHandlers[0]?.callback({ path: 'X', importer: '/app/index.ts' });
	assert.equal(result, undefined);
});

test('createBunPluginBridge onLoad returns tsx loader for .tsx files with explicit loader', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'rewrite',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'export const x = 1;', loader: 'tsx' }));
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.loadHandlers[0]?.callback({ path: '/app/index.tsx' });
	assert.equal(result && (result as { loader: string }).loader, 'tsx');
	assert.equal(result && (result as { contents: string }).contents, 'export const x = 1;');
});

test('createBunPluginBridge onLoad synthesizes a module source from exports', async () => {
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

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = (await fake.loadHandlers[0]?.callback({ path: '/app/data.json' })) as {
		contents: string;
		loader: string;
	};
	assert.equal(result.loader, 'js');
	assert.match(result.contents, /export default "hello";/);
	assert.match(result.contents, /export const named = 42;/);
});

test('createBunPluginBridge onLoad returns undefined for empty results', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.loadHandlers[0]?.callback({ path: '/app/index.ts' });
	assert.equal(result, undefined);
});

test('createBunPluginBridge module registers a unique namespace per specifier', async () => {
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

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	assert.equal(fake.resolveHandlers.length, 2);
	assert.equal(fake.loadHandlers.length, 2);
	const loadNamespaces = fake.loadHandlers.map((entry) => entry.options.namespace);
	assert.ok(loadNamespaces[0], 'first module has a load namespace');
	assert.ok(loadNamespaces[1], 'second module has a load namespace');
	assert.notEqual(loadNamespaces[0], loadNamespaces[1], 'namespaces are unique');
});

test('createBunPluginBridge normalizes local-css and global-css loaders to css', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'css',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'body { color: red; }', loader: 'global-css' }));
			},
		},
	];

	const bridge = createBunPluginBridge(plugins, '/app');
	const fake = createFakeBunBuild();
	await bridge.setup(fake.build);

	const result = await fake.loadHandlers[0]?.callback({ path: '/app/styles.css' });
	assert.equal(result && (result as { loader: string }).loader, 'css');
});
