import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { rolldown, type LoadResult, type Plugin, type ResolveIdResult } from 'rolldown';
import { test } from 'vitest';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';

type ResolveHook = (source: string, importer?: string, extraOptions?: unknown) => Promise<ResolveIdResult>;
type LoadHook = (id: string) => Promise<LoadResult>;

function hookHandler(hook: Plugin['resolveId'] | Plugin['load']): unknown {
	return typeof hook === 'function' ? hook : hook?.handler;
}

function callResolveId(plugin: Plugin, source: string, importer?: string): Promise<ResolveIdResult> {
	return (hookHandler(plugin.resolveId) as ResolveHook)(source, importer);
}

function callLoad(plugin: Plugin, id: string): Promise<LoadResult> {
	return (hookHandler(plugin.load) as LoadHook)(id);
}

test('createRolldownPluginBridge returns a single consolidated plugin', async () => {
	const plugins: EcoBuildPlugin[] = [
		{ name: 'a', setup: () => {} },
		{ name: 'b', setup: () => {} },
	];
	const bridge = await createRolldownPluginBridge(plugins, '/app');
	assert.equal(bridge.length, 1);
	assert.equal(bridge[0]?.name, 'ecopages-plugin-bridge');
});

test('createRolldownPluginBridge runs each plugin.setup in array order before returning', async () => {
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

	await createRolldownPluginBridge(plugins, '/app');
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	const result = (await callResolveId(plugin, 'react', '/app/index.ts')) as
		{ id: string; external: boolean } | undefined;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	const result = await callLoad(plugin, '/app/index.ts');
	assert.equal(result, undefined);
});

test('createRolldownPluginBridge load ignores object prototype loader names', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'proto-loader',
			setup(build) {
				build.onLoad({ filter: /.*/ }, () => ({ contents: 'export default 1', loader: 'toString' as never }));
			},
		},
	];

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
	const result = (await callLoad(plugin, '/app/proto.ts')) as { code: string; moduleType: string } | undefined;
	assert.equal(result?.moduleType, 'ts');
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;
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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;

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

	const bridge = await createRolldownPluginBridge(plugins, '/app');
	const plugin = bridge[0]!;

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
						`eco.component({ identity: { id: "layout", file: "${id}", integration: "react" },`,
					),
				};
			},
		},
	];

	const bridge = await createRolldownPluginBridge(plugins, '/app', sourceTransforms);
	const plugin = bridge[0]!;
	const result = (await callLoad(plugin, '/app/src/layouts/minimal-layout.tsx')) as
		{ code: string; moduleType: string } | undefined;

	assert.match(result?.code ?? '', /file: "\/app\/src\/layouts\/minimal-layout\.tsx"/);
	assert.equal(result?.moduleType, 'tsx');
});

test('createRolldownPluginBridge loads each of eleven virtual modules with its own contents', async () => {
	const specifiers = Array.from({ length: 11 }, (_, index) => `virtual:m${index}`);
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'many-modules',
			setup(build) {
				for (const specifier of specifiers) {
					build.module(specifier, () => ({ contents: `export default '${specifier}';`, loader: 'js' }));
				}
			},
		},
	];

	const plugin = (await createRolldownPluginBridge(plugins, '/app'))[0]!;

	for (const specifier of specifiers) {
		const resolve = (await callResolveId(plugin, specifier)) as { id: string } | undefined;
		const load = (await callLoad(plugin, resolve?.id ?? '')) as { code: string } | undefined;
		assert.equal(load?.code, `export default '${specifier}';`);
	}
});

test('createRolldownPluginBridge tests a namespaced filter against the path after the namespace', async () => {
	const plugins: EcoBuildPlugin[] = [
		{
			name: 'docs',
			setup(build) {
				build.onLoad({ filter: /\.md$/, namespace: 'docs' }, () => ({
					contents: 'export default 1;',
					loader: 'js',
				}));
			},
		},
	];

	const plugin = (await createRolldownPluginBridge(plugins, '/app'))[0]!;

	const matched = (await callLoad(plugin, 'docs:intro.md')) as { code: string } | undefined;
	const unmatched = (await callLoad(plugin, 'docs:introxmd')) as { code: string } | undefined;
	const otherNamespace = (await callLoad(plugin, 'other:intro.md')) as { code: string } | undefined;
	assert.equal(matched?.code, 'export default 1;');
	assert.notEqual(unmatched?.code, 'export default 1;');
	assert.notEqual(otherNamespace?.code, 'export default 1;');
});

test('createRolldownPluginBridge merges plugins into one, where the earlier plugin resolves first', async () => {
	const plugins: EcoBuildPlugin[] = ['first', 'second'].map((name) => ({
		name,
		setup(build) {
			build.onResolve({ filter: /^shared$/ }, () => ({ path: `/${name}.ts` }));
		},
	}));

	const bridge = await createRolldownPluginBridge(plugins, '/app');

	assert.equal(bridge.length, 1);
	const resolved = (await callResolveId(bridge[0]!, 'shared')) as { id: string } | undefined;
	assert.equal(resolved?.id, '/first.ts');
});

function spyOnHook(plugin: Plugin, hookName: 'resolveId' | 'load', calls: string[]): void {
	const hook = plugin[hookName];
	const handler = hookHandler(hook) as (this: unknown, ...args: unknown[]) => unknown;
	const spy = function (this: unknown, ...args: unknown[]) {
		calls.push(args[0] as string);
		return handler.apply(this, args);
	};
	Object.assign(plugin, { [hookName]: typeof hook === 'function' ? spy : { ...hook, handler: spy } });
}

test('createRolldownPluginBridge calls into JavaScript only for ids that a registration may match', async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'eco-bridge-filters-'));
	try {
		writeFileSync(
			path.join(root, 'entry.ts'),
			"import './plain.ts';\nimport './doc.md';\nimport 'virtual:greeting';\n",
		);
		writeFileSync(path.join(root, 'plain.ts'), "console.log('plain');\n");
		writeFileSync(path.join(root, 'doc.md'), '# doc\n');
		const plugins: EcoBuildPlugin[] = ['first', 'second'].map((name) => ({
			name,
			setup(build) {
				build.onLoad({ filter: /\.md$/ }, () => ({ contents: `console.log('${name} doc');`, loader: 'js' }));
				build.module('virtual:greeting', () => ({
					contents: `console.log('${name} greeting');`,
					loader: 'js',
				}));
			},
		}));

		const [plugin] = await createRolldownPluginBridge(plugins, root);
		const resolveCalls: string[] = [];
		const loadCalls: string[] = [];
		spyOnHook(plugin!, 'resolveId', resolveCalls);
		spyOnHook(plugin!, 'load', loadCalls);

		const bundle = await rolldown({ input: path.join(root, 'entry.ts'), cwd: root, plugins: [plugin!] });
		const { output } = await bundle.generate({ format: 'esm' });
		await bundle.close();

		assert.match(output[0].code, /first doc/);
		assert.match(output[0].code, /first greeting/);
		assert.doesNotMatch(output[0].code, /second/);
		assert.deepEqual(resolveCalls, ['virtual:greeting']);
		assert.deepEqual(loadCalls.map((id) => id.replace(/^.*[\\/]/, '')).sort(), [
			'doc.md',
			'ecopages-module-0:virtual:greeting',
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('createRolldownPluginBridge rejects handlers registered after setup finished', async () => {
	let lateBuilder: Parameters<EcoBuildPlugin['setup']>[0] | undefined;
	await createRolldownPluginBridge(
		[
			{
				name: 'late',
				setup(build) {
					lateBuilder = build;
				},
			},
		],
		'/app',
	);

	assert.throws(
		() => lateBuilder!.onLoad({ filter: /\.md$/ }, () => undefined),
		/build\.onLoad\(\) was called after/,
	);
	assert.throws(() => lateBuilder!.onResolve({ filter: /^x$/ }, () => undefined), /build\.onResolve\(\)/);
	assert.throws(() => lateBuilder!.module('virtual:x', () => ({ contents: '' })), /build\.module\(\)/);
});
