import assert from 'node:assert/strict';
import path from 'node:path';

import { test } from 'vitest';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import type { EcoBuildPlugin } from './build-types.ts';
import type { LoadResult, ResolveIdResult } from 'rolldown';

const fakeContext = {} as never;

type ResolveHook = (source: string, importer?: string, extraOptions?: unknown) => Promise<ResolveIdResult>;
type LoadHook = (id: string) => Promise<LoadResult>;
type BuildStartHook = (this: unknown) => Promise<unknown> | unknown;

function callResolveId(
	plugin: ReturnType<typeof createRolldownPluginBridge>[number],
	source: string,
	importer?: string,
): Promise<ResolveIdResult> {
	return (plugin.resolveId as unknown as ResolveHook)(source, importer);
}

function callLoad(plugin: ReturnType<typeof createRolldownPluginBridge>[number], id: string): Promise<LoadResult> {
	return (plugin.load as unknown as LoadHook)(id);
}

async function callBuildStart(plugin: ReturnType<typeof createRolldownPluginBridge>[number]): Promise<void> {
	await (plugin.buildStart as unknown as BuildStartHook).call(fakeContext);
}

test('createRolldownPluginBridge returns a single consolidated plugin', () => {
	const plugins: EcoBuildPlugin[] = [
		{ name: 'a', setup: () => {} },
		{ name: 'b', setup: () => {} },
	];
	const bridge = createRolldownPluginBridge(plugins, '/app');
	assert.equal(bridge.length, 1);
	assert.equal(bridge[0]?.name, 'ecopages-plugin-bridge');
});

test('createRolldownPluginBridge runs each plugin.setup during buildStart', async () => {
	const setupCalls: string[] = [];
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'a',
			setup: () => {
				setupCalls.push('a');
			},
		},
		{
			name: 'b',
			setup: () => {
				setupCalls.push('b');
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	for (const plugin of bridge) {
		await callBuildStart(plugin);
	}
	assert.deepEqual(setupCalls, ['a', 'b']);
});

test('createRolldownPluginBridge resolveId translates EcoBuildOnResolveResult to Rolldown shape', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'alias',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/vendor/react.js', external: true }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callResolveId(plugin, 'react', '/app/index.ts')) as
		| { id: string; external: boolean }
		| undefined;
	assert.deepEqual(result, { id: '/vendor/react.js', external: true });
});

test('createRolldownPluginBridge resolveId resolves relative paths against the importer', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'relative',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: './sibling.ts' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callResolveId(plugin, 'X', '/app/sub/index.ts')) as { id: string } | undefined;
	assert.equal(result?.id, path.resolve('/app/sub', './sibling.ts'));
});

test('createRolldownPluginBridge resolveId leaves absolute paths untouched', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'absolute',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => ({ path: '/abs/path.ts' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callResolveId(plugin, 'X', '/app/index.ts')) as { id: string } | undefined;
	assert.equal(result?.id, '/abs/path.ts');
});

test('createRolldownPluginBridge resolveId returns undefined for empty callbacks', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onResolve({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = await callResolveId(plugin, 'X', '/app/index.ts');
	assert.equal(result, undefined);
});

test('createRolldownPluginBridge load returns moduleType for .tsx files with explicit loader', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'rewrite',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'export const x = 1;', loader: 'tsx' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callLoad(plugin, '/app/index.tsx')) as { code: string; moduleType: string } | undefined;
	assert.equal(result?.moduleType, 'tsx');
	assert.equal(result?.code, 'export const x = 1;');
});

test('createRolldownPluginBridge load synthesizes source from exports', async () => {
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

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callLoad(plugin, '/app/data.json')) as { code: string; moduleType: string } | undefined;
	assert.equal(result?.moduleType, 'js');
	assert.match(result?.code ?? '', /export default "hello";/);
	assert.match(result?.code ?? '', /export const named = 42;/);
});

test('createRolldownPluginBridge load returns undefined for empty callbacks', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'noop',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => undefined);
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = await callLoad(plugin, '/app/index.ts');
	assert.equal(result, undefined);
});

test('createRolldownPluginBridge load normalizes local-css and global-css to css', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'css',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'body { color: red; }', loader: 'global-css' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callLoad(plugin, '/app/styles.css')) as { code: string; moduleType: string } | undefined;
	assert.equal(result?.moduleType, 'css');
});

test('createRolldownPluginBridge module() registers unique namespaces per specifier', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'm1',
			setup(build) {
				build.module('virtual:foo', () => ({ contents: 'foo', loader: 'js' }));
			},
		},
		{
			name: 'm2',
			setup(build) {
				build.module('virtual:bar', () => ({ contents: 'bar', loader: 'js' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);

	const fooResolve = (await callResolveId(plugin, 'virtual:foo')) as { id: string } | undefined;
	const barResolve = (await callResolveId(plugin, 'virtual:bar')) as { id: string } | undefined;
	assert.ok(fooResolve?.id.startsWith('ecopages-module-0:'), 'first module has its own namespace');
	assert.ok(barResolve?.id.startsWith('ecopages-module-1:'), 'second module has its own namespace');
	assert.notEqual(fooResolve?.id, barResolve?.id);
});

test('createRolldownPluginBridge loads virtual module content with the registered namespace', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'm1',
			setup(build) {
				build.module('virtual:foo', () => ({ contents: 'export const x = 1;', loader: 'js' }));
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	await callBuildStart(plugin);

	const resolve = (await callResolveId(plugin, 'virtual:foo')) as { id: string } | undefined;
	const load = (await callLoad(plugin, resolve?.id ?? '')) as { code: string; moduleType: string } | undefined;
	assert.equal(load?.code, 'export const x = 1;');
	assert.equal(load?.moduleType, 'js');
});

test('createRolldownPluginBridge applies source transforms after first-wins onLoad rewrites', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'rewrite',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({
					contents: 'export default eco.component({ render: () => null });',
					loader: 'tsx',
				}));
			},
		},
	];

	const sourceTransforms = [
		{
			name: 'eco-component-meta-plugin',
			filter: /layout\.tsx$/,
			transform(code: string, id: string) {
				return {
					code: code.replace(
						'eco.component({',
						`eco.component({ __eco: { id: "layout", file: "${id}", integration: "react" },`,
					),
				};
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app', sourceTransforms);
	const plugin = bridge[0]!;
	await callBuildStart(plugin);
	const result = (await callLoad(plugin, '/app/src/layouts/minimal-layout.tsx')) as
		| { code: string; moduleType: string }
		| undefined;

	assert.match(result?.code ?? '', /file: "\/app\/src\/layouts\/minimal-layout\.tsx"/);
	assert.equal(result?.moduleType, 'tsx');
});

test('createRolldownPluginBridge does not multiply onLoad handler registrations across rebuilds', async () => {
	let loadCalls = 0;
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'counter',
			setup(build) {
				build.onLoad({ filter: /counter\.ts$/ }, () => {
					loadCalls += 1;
					return { contents: 'export const count = 1;', loader: 'ts' };
				});
			},
		},
	];

	const bridge = createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;

	for (let rebuild = 0; rebuild < 3; rebuild += 1) {
		await callBuildStart(plugin);
		loadCalls = 0;
		await callLoad(plugin, '/app/counter.ts');
		assert.equal(loadCalls, 1, `rebuild ${rebuild + 1} should invoke the onLoad handler once`);
	}
});
