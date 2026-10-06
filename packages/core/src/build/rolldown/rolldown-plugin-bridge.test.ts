import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SourceMap } from 'node:module';

import { rolldown, RolldownMagicString, type LoadResult, type Plugin, type ResolveIdResult } from 'rolldown';
import { test } from 'vitest';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import { createEcoBuildPluginFromSourceTransform, type EcoSourceTransform } from '../../plugins/source-transform.ts';

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

test('createRolldownPluginBridge returns the merged plugin plus one plugin per transform', async () => {
	const plugins: EcoBuildPlugin[] = [
		{ name: 'a', setup: () => {} },
		{ name: 'b', setup: () => {}, transform: { filter: /\.ts$/, handler: () => undefined } },
		{ name: 'c', setup: () => {} },
	];
	const bridge = await createRolldownPluginBridge(plugins, '/app');
	assert.deepEqual(
		bridge.map((plugin) => plugin.name),
		['ecopages-plugin-bridge', 'ecopages-transform:b'],
	);
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

async function bundleWithBridge(root: string, plugins: EcoBuildPlugin[]) {
	const bundle = await rolldown({
		input: path.join(root, 'entry.ts'),
		cwd: root,
		plugins: await createRolldownPluginBridge(plugins, root),
	});
	const { output } = await bundle.generate({ format: 'esm', sourcemap: true });
	await bundle.close();
	return output[0];
}

function withFixture(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
	const root = mkdtempSync(path.join(os.tmpdir(), 'eco-bridge-transform-'));
	for (const [name, contents] of Object.entries(files)) {
		writeFileSync(path.join(root, name), contents);
	}
	return run(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

test('createRolldownPluginBridge runs plugin transforms on onLoad output, in pre, default, post order', async () => {
	const marker = (name: string, order?: 'pre' | 'post'): EcoBuildPlugin => ({
		name,
		setup() {},
		transform: { filter: /entry\.ts$/, order, handler: (code) => `${code}console.log('${name}');\n` },
	});
	const rewrite: EcoBuildPlugin = {
		name: 'rewrite',
		setup(build) {
			build.onLoad({ filter: /entry\.ts$/ }, () => ({ contents: "console.log('loaded');\n", loader: 'ts' }));
		},
	};

	await withFixture({ 'entry.ts': "console.log('disk');\n" }, async (root) => {
		const chunk = await bundleWithBridge(root, [
			marker('post', 'post'),
			rewrite,
			marker('default'),
			marker('pre', 'pre'),
		]);
		const logged = [...chunk.code.matchAll(/console\.log\("(\w+)"\)/g)].map((match) => match[1]);
		assert.deepEqual(logged, ['loaded', 'pre', 'default', 'post']);
	});
});

test('createRolldownPluginBridge keeps the source map of a transform that inserts a line', async () => {
	const insertLine: EcoBuildPlugin = {
		name: 'insert-line',
		setup() {},
		transform: {
			filter: /entry\.ts$/,
			handler(code, id) {
				const magic = new RolldownMagicString(code).prepend("console.log('inserted');\n");
				return { code: magic.toString(), map: magic.generateMap({ source: id, hires: true }).toString() };
			},
		},
	};
	const source = "export function fail() {\n\tthrow new Error('original line 2');\n}\n";

	await withFixture({ 'entry.ts': source }, async (root) => {
		const chunk = await bundleWithBridge(root, [insertLine]);
		const lines = chunk.code.split('\n');
		const line = lines.findIndex((text) => text.includes('original line 2'));
		const column = lines[line]!.indexOf('throw');
		const entry = new SourceMap(JSON.parse(chunk.map!.toString())).findEntry(line, column);

		assert.ok('originalLine' in entry, 'the thrown statement has a mapping');
		assert.match(entry.originalSource, /entry\.ts$/);
		assert.equal(entry.originalLine, 1);
	});
});

function createInsertLinePlugin(): EcoBuildPlugin {
	return {
		name: 'insert-line',
		setup() {},
		transform: {
			filter: /entry\.ts$/,
			order: 'pre',
			handler(code, id) {
				const magic = new RolldownMagicString(code).prepend("console.log('inserted');\n");
				return { code: magic.toString(), map: magic.generateMap({ source: id, hires: true }).toString() };
			},
		},
	};
}

test('createRolldownPluginBridge keeps the earlier source map when a later transform returns a string', async () => {
	const appendString: EcoBuildPlugin = {
		name: 'append-string',
		setup() {},
		transform: { filter: /entry\.ts$/, handler: (code) => `${code}console.log('appended');\n` },
	};
	const source = "export function fail() {\n\tthrow new Error('original line 2');\n}\n";

	await withFixture({ 'entry.ts': source }, async (root) => {
		const chunk = await bundleWithBridge(root, [createInsertLinePlugin(), appendString]);
		assert.match(chunk.code, /appended/);
		const lines = chunk.code.split('\n');
		const line = lines.findIndex((text) => text.includes('original line 2'));
		const entry = new SourceMap(JSON.parse(chunk.map!.toString())).findEntry(line, lines[line]!.indexOf('throw'));

		assert.ok('originalLine' in entry, 'the thrown statement has a mapping');
		assert.equal(entry.originalLine, 1);
	});
});

test('createRolldownPluginBridge does not transform \\0 virtual ids or namespaced ids', async () => {
	const transformedIds: string[] = [];
	const virtualModules: EcoBuildPlugin = {
		name: 'virtual-modules',
		setup(build) {
			build.onResolve({ filter: /^virtual:null$/ }, () => ({ path: '\0virtual-null.ts' }));
			build.onLoad({ filter: /^\0virtual-null\.ts$/ }, () => ({
				contents: "console.log('null');",
				loader: 'ts',
			}));
			build.module('virtual:namespaced.ts', () => ({ contents: "console.log('namespaced');", loader: 'ts' }));
		},
		transform: {
			filter: /.*/,
			handler(code, id) {
				transformedIds.push(id);
				return undefined;
			},
		},
	};

	await withFixture({ 'entry.ts': "import 'virtual:null';\nimport 'virtual:namespaced.ts';\n" }, async (root) => {
		const chunk = await bundleWithBridge(root, [virtualModules]);
		assert.match(chunk.code, /namespaced/);
		assert.match(chunk.code, /"null"/);
		assert.deepEqual(
			transformedIds.map((id) => path.basename(id)),
			['entry.ts'],
		);
	});
});

class BannerTransform implements EcoSourceTransform {
	readonly name = 'banner';
	readonly filter = /entry\.ts$/;
	readonly #statement = "console.log('banner');\n";

	transform(code: string): string {
		return `${this.#statement}${code}`;
	}
}

test('createRolldownPluginBridge calls a class-based source transform with its own this', async () => {
	await withFixture({ 'entry.ts': "console.log('entry');\n" }, async (root) => {
		const chunk = await bundleWithBridge(root, [createEcoBuildPluginFromSourceTransform(new BannerTransform())]);
		assert.match(chunk.code, /console\.log\("banner"\);\s*console\.log\("entry"\)/);
	});
});
