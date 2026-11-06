import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { originalPositionFor, TraceMap, type SourceMapInput } from '@jridgewell/trace-mapping';
import MagicString from 'magic-string';
import { rolldown, type LoadResult, type Plugin, type ResolveIdResult } from 'rolldown';
import { afterEach, beforeEach, test } from 'vitest';
import { createRolldownPluginBridge, type WatchFilesByModule } from './rolldown-plugin-bridge.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';

type ResolveHook = (source: string, importer?: string) => Promise<ResolveIdResult>;
type LoadHook = (this: unknown, id: string) => Promise<LoadResult>;
type TransformHook = (code: string, id: string) => Promise<{ code: string; map?: unknown } | null>;

function hookHandler(hook: Plugin['resolveId'] | Plugin['load'] | Plugin['transform']): unknown {
	return typeof hook === 'function' ? hook : hook?.handler;
}

function callResolveId(plugin: Plugin, source: string, importer?: string): Promise<ResolveIdResult> {
	return (hookHandler(plugin.resolveId) as ResolveHook)(source, importer);
}

function callLoad(plugin: Plugin, id: string): Promise<LoadResult> {
	return (hookHandler(plugin.load) as LoadHook)(id);
}

function callTransform(plugin: Plugin, code: string, id: string): Promise<{ code: string; map?: unknown } | null> {
	return (hookHandler(plugin.transform) as TransformHook)(code, id);
}

async function bridgeOne(plugin: EcoBuildPlugin): Promise<Plugin> {
	const [rolldownPlugin] = await createRolldownPluginBridge([plugin], '/app');
	assert.ok(rolldownPlugin);
	return rolldownPlugin;
}

let root: string;

beforeEach(() => {
	root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-bridge-')));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** Bundles `files` (the first is the entry) through the bridged plugins and returns the entry chunk. */
async function bundle(files: Record<string, string>, plugins: EcoBuildPlugin[], extra: Plugin[] = []) {
	for (const [name, contents] of Object.entries(files)) writeFileSync(path.join(root, name), contents);
	const build = await rolldown({
		input: path.join(root, Object.keys(files)[0]!),
		cwd: root,
		plugins: [...(await createRolldownPluginBridge(plugins, root)), ...extra],
	});
	try {
		const { output } = await build.generate({ format: 'esm', sourcemap: true });
		return output[0];
	} finally {
		await build.close();
	}
}

function prependTransform(name: string, mapped: boolean): EcoBuildPlugin {
	return {
		name,
		setup(build) {
			build.transform({ filter: /page\.ts$/ }, (code, id) => {
				const source = new MagicString(code, { filename: id });
				source.prepend(`${name};\n`);
				return {
					code: source.toString(),
					...(mapped
						? { map: source.generateMap({ source: id, includeContent: true, hires: 'boundary' }) }
						: {}),
				};
			});
		},
	};
}

/** The original line `const value` in the bundled chunk maps back to, or `null` when it does not map. */
function originalLineOfValue(chunk: { code: string; map: unknown }): number | null {
	const lines = chunk.code.split('\n');
	const line = lines.findIndex((text) => text.includes('const value'));
	assert.notEqual(line, -1);
	return originalPositionFor(new TraceMap(chunk.map as SourceMapInput), {
		line: line + 1,
		column: lines[line]!.indexOf('const value'),
	}).line;
}

test('maps each handler to a Rolldown plugin named after its EcoBuildPlugin, in order', async () => {
	const plugins = await createRolldownPluginBridge(
		[
			{
				name: 'a',
				setup(build) {
					build.onResolve({ filter: /^x$/ }, () => undefined);
					build.onLoad({ filter: /\.md$/ }, () => undefined);
				},
			},
			{ name: 'empty', setup: () => {} },
			{ name: 'b', setup: (build) => build.transform({ filter: /\.ts$/ }, (code) => code) },
		],
		'/app',
	);

	assert.deepEqual(
		plugins.map((plugin) => plugin.name),
		['a', 'a', 'b'],
	);
});

test('runs each plugin.setup in array order before returning', async () => {
	const setupCalls: string[] = [];
	await createRolldownPluginBridge(
		['a', 'b'].map((name) => ({ name, setup: () => void setupCalls.push(name) })),
		'/app',
	);
	assert.deepEqual(setupCalls, ['a', 'b']);
});

test('gives every plugin the same entrypoint map', async () => {
	const entrypoints = Object.freeze({ first: '/app/first.ts', second: '/app/second.ts' });
	const seen: Array<Readonly<Record<string, string>> | undefined> = [];
	await createRolldownPluginBridge(
		['first', 'second'].map((name) => ({ name, setup: (build) => void seen.push(build.entrypoints) })),
		'/app',
		{ entrypoints },
	);

	assert.equal(seen[0], entrypoints);
	assert.equal(seen[1], entrypoints);
});

test('resolveId translates EcoBuildOnResolveResult to Rolldown shape', async () => {
	const plugin = await bridgeOne({
		name: 'alias',
		setup: (build) => build.onResolve({ filter: /.*/ }, () => ({ path: '/vendor/react.js', external: true })),
	});
	assert.deepEqual(await callResolveId(plugin, 'react', '/app/index.ts'), { id: '/vendor/react.js', external: true });
});

test('resolveId resolves relative paths against the importer', async () => {
	const plugin = await bridgeOne({
		name: 'relative',
		setup: (build) => build.onResolve({ filter: /.*/ }, () => ({ path: './sibling.ts' })),
	});
	const result = (await callResolveId(plugin, 'X', '/app/sub/index.ts')) as { id: string } | null;
	assert.equal(result?.id, path.resolve('/app/sub', './sibling.ts'));
});

test('resolveId leaves absolute paths and virtual ids untouched', async () => {
	for (const resolved of ['/abs/path.ts', '\0virtual:thing']) {
		const plugin = await bridgeOne({
			name: 'absolute',
			setup: (build) => build.onResolve({ filter: /.*/ }, () => ({ path: resolved })),
		});
		const result = (await callResolveId(plugin, 'X', '/app/index.ts')) as { id: string } | null;
		assert.equal(result?.id, resolved);
	}
});

test('resolveId returns null for empty callbacks', async () => {
	const plugin = await bridgeOne({
		name: 'noop',
		setup: (build) => build.onResolve({ filter: /.*/ }, () => undefined),
	});
	assert.equal(await callResolveId(plugin, 'X', '/app/index.ts'), null);
});

test('addWatchFile declares a file to Rolldown and under the module the callback ran for', async () => {
	const watchFiles: WatchFilesByModule = new Map();
	const rolldownWatchFiles: string[] = [];
	const [plugin] = await createRolldownPluginBridge(
		[
			{
				name: 'docs',
				setup(build) {
					build.onLoad({ filter: /.*/ }, async (args) => {
						await Promise.resolve();
						build.addWatchFile(`data/${path.basename(args.path, '.tsx')}.json`);
						return { contents: 'export default 1', loader: 'js' };
					});
				},
			},
		],
		'/app',
		{ watchFiles },
	);
	const load = hookHandler(plugin!.load) as LoadHook;
	const context = { addWatchFile: (id: string) => rolldownWatchFiles.push(id) };
	await Promise.all([load.call(context, '/app/pages/a.tsx'), load.call(context, '/app/pages/b.tsx')]);

	assert.deepEqual(rolldownWatchFiles.sort(), [path.resolve('/app/data/a.json'), path.resolve('/app/data/b.json')]);
	assert.deepEqual([...watchFiles].map(([moduleId, files]) => [moduleId, [...files]]).sort(), [
		['/app/pages/a.tsx', [path.resolve('/app/data/a.json')]],
		['/app/pages/b.tsx', [path.resolve('/app/data/b.json')]],
	]);
});

test('load returns moduleType for .tsx files with explicit loader', async () => {
	const plugin = await bridgeOne({
		name: 'rewrite',
		setup: (build) => build.onLoad({ filter: /.*/ }, () => ({ contents: 'export const x = 1;', loader: 'tsx' })),
	});
	const result = (await callLoad(plugin, '/app/index.tsx')) as { code: string; moduleType: string } | null;
	assert.equal(result?.moduleType, 'tsx');
	assert.equal(result?.code, 'export const x = 1;');
});

test('load returns null for empty callbacks', async () => {
	const plugin = await bridgeOne({ name: 'noop', setup: (build) => build.onLoad({ filter: /.*/ }, () => undefined) });
	assert.equal(await callLoad(plugin, '/app/index.ts'), null);
});

test('load ignores object prototype loader names', async () => {
	const plugin = await bridgeOne({
		name: 'proto-loader',
		setup: (build) =>
			build.onLoad({ filter: /.*/ }, () => ({ contents: 'export default 1', loader: 'toString' as never })),
	});
	const result = (await callLoad(plugin, '/app/proto.ts')) as { moduleType: string } | null;
	assert.equal(result?.moduleType, 'ts');
});

test('module() serves each specifier as its own \\0 virtual module', async () => {
	const plugins = await createRolldownPluginBridge(
		['foo', 'bar'].map((name) => ({
			name,
			setup: (build) =>
				build.module(`virtual:${name}`, () => ({ contents: `export default '${name}';`, loader: 'js' })),
		})),
		'/app',
	);

	for (const [index, name] of ['foo', 'bar'].entries()) {
		const resolved = await callResolveId(plugins[index]!, `virtual:${name}`);
		assert.equal(resolved, `\0virtual:${name}`);
		const loaded = (await callLoad(plugins[index]!, resolved as string)) as { code: string; moduleType: string };
		assert.equal(loaded.code, `export default '${name}';`);
		assert.equal(loaded.moduleType, 'js');
	}
});

test('a module() virtual module bundles and stays out of transforms', async () => {
	const transformed: string[] = [];
	const chunk = await bundle({ 'entry.ts': "import images from 'ecopages:images';\nconsole.log(images);\n" }, [
		{
			name: 'ecopages:images',
			setup: (build) => build.module('ecopages:images', () => ({ contents: 'export default "hero.png";' })),
		},
		{
			name: 'record-every-module',
			setup: (build) =>
				build.transform({ filter: /.*/ }, (code, id) => {
					transformed.push(id);
					return code;
				}),
		},
	]);

	assert.match(chunk.code, /hero\.png/);
	assert.deepEqual(transformed, [path.join(root, 'entry.ts')]);
});

test('applies transform plugins after a first-wins onLoad rewrite', async () => {
	const chunk = await bundle({ 'layout.tsx': 'export default 0;\n' }, [
		{
			name: 'rewrite',
			setup: (build) =>
				build.onLoad({ filter: /layout\.tsx$/ }, () => ({
					contents: 'export default "loaded";',
					loader: 'tsx',
				})),
		},
		{
			name: 'ignored-loader',
			setup: (build) =>
				build.onLoad({ filter: /layout\.tsx$/ }, () => ({
					contents: 'export default "second";',
					loader: 'tsx',
				})),
		},
		{
			name: 'meta',
			setup: (build) =>
				build.transform({ filter: /layout\.tsx$/ }, (code) => ({
					code: code.replace('loaded', 'transformed'),
				})),
		},
	]);

	assert.match(chunk.code, /"transformed"/);
	assert.doesNotMatch(chunk.code, /second/);
});

test('runs transforms in plugin order', async () => {
	const chunk = await bundle({ 'page.ts': 'export const value = [];\n' }, [
		{
			name: 'first',
			setup: (build) => build.transform({ filter: /page\.ts$/ }, (code) => code.replace('[]', '["first"]')),
		},
		{
			name: 'second',
			setup: (build) =>
				build.transform({ filter: /page\.ts$/ }, (code) => code.replace('"first"]', '"first", "second"]')),
		},
	]);

	assert.match(chunk.code, /\["first", "second"\]/);
});

test('forwards a transform source map', async () => {
	const map = { version: 3, file: 'page.ts', sources: ['/app/page.ts'], names: [], mappings: ';AAAA' };
	const plugin = await bridgeOne({
		name: 'insert-line',
		setup: (build) =>
			build.transform({ filter: /page\.ts$/ }, (code) => ({ code: `/* injected */\n${code}`, map })),
	});
	const result = await callTransform(plugin, 'export const value = 1;', '/app/page.ts');

	assert.equal(result?.code, '/* injected */\nexport const value = 1;');
	assert.equal(result?.map, map);
});

test('forwards a source map from a load result', async () => {
	const map = { version: 3, sources: ['/app/page.mdx'], names: [], mappings: 'AAAA' };
	const plugin = await bridgeOne({
		name: 'mapped-loader',
		setup: (build) =>
			build.onLoad({ filter: /page\.mdx$/ }, () => ({ contents: 'export default 1;', loader: 'js', map })),
	});
	const result = await callLoad(plugin, '/app/page.mdx');

	assert.equal(result && typeof result === 'object' && 'map' in result ? result.map : undefined, map);
});

test('emits an empty map for a rewrite without a usable map', async () => {
	for (const map of [{}, undefined]) {
		const plugin = await bridgeOne({
			name: 'insert-line',
			setup: (build) =>
				build.transform({ filter: /page\.ts$/ }, (code) => ({ code: `/* injected */\n${code}`, map })),
		});
		const result = await callTransform(plugin, 'export const value = 1;', '/app/page.ts');

		assert.equal(result?.code, '/* injected */\nexport const value = 1;');
		assert.deepEqual(result?.map, { mappings: '' });
	}
});

test('emits an empty map for a string-returning rewrite and nothing for an unchanged one', async () => {
	const plugin = await bridgeOne({
		name: 'string',
		setup: (build) => build.transform({ filter: /page\.ts$/ }, (code) => code.replace('changed', 'CHANGED')),
	});

	assert.deepEqual(await callTransform(plugin, 'changed;', '/app/page.ts'), {
		code: 'CHANGED;',
		map: { mappings: '' },
	});
	assert.equal(await callTransform(plugin, 'same;', '/app/page.ts'), null);
});

test('forwards null maps to preserve an upstream map', async () => {
	const plugin = await bridgeOne({
		name: 'preserve-map',
		setup: (build) => build.transform({ filter: /page\.ts$/ }, (code) => ({ code, map: null })),
	});
	const result = await callTransform(plugin, 'export const value = 1;', '/app/page.ts');

	assert.equal(result?.map, null);
});

test('chains the maps of mapped transforms', async () => {
	const chunk = await bundle({ 'page.ts': 'export const value = 1;\n' }, [
		prependTransform('first', true),
		prependTransform('second', true),
	]);

	assert.equal(originalLineOfValue(chunk), 1);
});

test('does not reuse an earlier map after an unmapped rewrite', async () => {
	const chunk = await bundle({ 'page.ts': 'export const value = 1;\n' }, [
		prependTransform('mapped', true),
		prependTransform('unmapped', false),
	]);

	assert.equal(originalLineOfValue(chunk), null);
});

for (const order of ['mapped-first', 'empty-first'] as const) {
	test(`treats an empty map as unmapped next to a mapped transform (${order})`, async () => {
		const empty: EcoBuildPlugin = {
			name: 'empty',
			setup: (build) =>
				build.transform({ filter: /page\.ts$/ }, (code) => ({
					code: `empty;\n${code}`,
					map: { mappings: '' },
				})),
		};
		const mapped = prependTransform('mapped', true);
		const chunk = await bundle(
			{ 'page.ts': 'export const value = 1;\n' },
			order === 'mapped-first' ? [mapped, empty] : [empty, mapped],
		);

		assert.equal(originalLineOfValue(chunk), null);
	});
}

test('chains a mapped rewrite after a transform that preserved the incoming map', async () => {
	const chunk = await bundle({ 'page.ts': 'export const value = 1;\n' }, [
		{
			name: 'preserve-map',
			setup: (build) => build.transform({ filter: /page\.ts$/ }, (code) => ({ code, map: null })),
		},
		prependTransform('mapped', true),
	]);

	assert.equal(originalLineOfValue(chunk), 1);
});

test('drops a preserved map after an unmapped rewrite', async () => {
	const chunk = await bundle({ 'page.ts': 'export const value = 1;\n' }, [
		{
			name: 'preserve-map',
			setup: (build) => build.transform({ filter: /page\.ts$/ }, (code) => ({ code, map: null })),
		},
		prependTransform('unmapped', false),
	]);

	assert.equal(originalLineOfValue(chunk), null);
});

test('gives the earlier plugin precedence in resolveId', async () => {
	const chunk = await bundle(
		{ 'entry.ts': "import value from 'shared';\nconsole.log(value);\n" },
		['first', 'second'].map((name) => ({
			name,
			setup: (build) => build.onResolve({ filter: /^shared$/ }, () => ({ path: `\0${name}` })),
		})),
		[{ name: 'virtual', load: (id) => (id.startsWith('\0') ? `export default "${id.slice(1)}";` : null) }],
	);

	assert.match(chunk.code, /"first"/);
	assert.doesNotMatch(chunk.code, /"second"/);
});

function spyOnHooks(plugins: Plugin[], hookName: 'resolveId' | 'load', calls: string[]): void {
	for (const plugin of plugins) {
		const hook = plugin[hookName];
		if (!hook) continue;
		const handler = hookHandler(hook) as (this: unknown, ...args: unknown[]) => unknown;
		const spy = function (this: unknown, ...args: unknown[]) {
			calls.push(args[0] as string);
			return handler.apply(this, args);
		};
		Object.assign(plugin, { [hookName]: typeof hook === 'function' ? spy : { ...hook, handler: spy } });
	}
}

test('calls into JavaScript only for ids a handler filter matches, and only until one answers', async () => {
	writeFileSync(
		path.join(root, 'entry.ts'),
		"import './plain.ts';\nimport './doc.md';\nimport './skip.md';\nimport 'virtual:greeting';\n",
	);
	writeFileSync(path.join(root, 'plain.ts'), "console.log('plain');\n");
	writeFileSync(path.join(root, 'doc.md'), '# doc\n');
	writeFileSync(path.join(root, 'skip.md'), '# skip\n');
	const plugins = await createRolldownPluginBridge(
		['first', 'second'].map((name) => ({
			name,
			setup(build) {
				build.onLoad({ filter: /\.md$/, exclude: /skip\.md$/ }, () => ({
					contents: `console.log('${name} doc');`,
					loader: 'js',
				}));
				build.module('virtual:greeting', () => ({
					contents: `console.log('${name} greeting');`,
					loader: 'js',
				}));
			},
		})),
		root,
	);
	const resolveCalls: string[] = [];
	const loadCalls: string[] = [];
	spyOnHooks(plugins, 'resolveId', resolveCalls);
	spyOnHooks(plugins, 'load', loadCalls);
	const markdown: Plugin = {
		name: 'markdown',
		load: (id) => (id.endsWith('skip.md') ? 'console.log("skipped");' : null),
	};

	const build = await rolldown({ input: path.join(root, 'entry.ts'), cwd: root, plugins: [...plugins, markdown] });
	const { output } = await build.generate({ format: 'esm' });
	await build.close();

	assert.match(output[0].code, /first doc/);
	assert.match(output[0].code, /first greeting/);
	assert.match(output[0].code, /skipped/);
	assert.doesNotMatch(output[0].code, /second/);
	assert.deepEqual(resolveCalls, ['virtual:greeting']);
	assert.deepEqual(loadCalls.map((id) => id.replace(/^.*[\\/]/, '')).sort(), ['\0virtual:greeting', 'doc.md']);
});

test('rejects handlers registered after setup finished, and addWatchFile outside a callback', async () => {
	let lateBuilder: Parameters<EcoBuildPlugin['setup']>[0] | undefined;
	await createRolldownPluginBridge([{ name: 'late', setup: (build) => void (lateBuilder = build) }], '/app');

	assert.throws(
		() => lateBuilder!.onLoad({ filter: /\.md$/ }, () => undefined),
		/build\.onLoad\(\) was called after/,
	);
	assert.throws(() => lateBuilder!.onResolve({ filter: /^x$/ }, () => undefined), /build\.onResolve\(\)/);
	assert.throws(() => lateBuilder!.module('virtual:x', () => ({ contents: '' })), /build\.module\(\)/);
	assert.throws(() => lateBuilder!.transform({ filter: /\.ts$/ }, (code) => code), /build\.transform\(\)/);
	assert.throws(() => lateBuilder!.addWatchFile('/app/data.json'), /addWatchFile\(\) was called outside/);
});

test('transforms a module whose id has a query, also when the query holds a colon', async () => {
	const tagged = path.join(root, 'tagged.ts');
	writeFileSync(tagged, 'export const value = 1;\n');
	const chunk = await bundle({ 'entry.ts': "export * from 'tagged';\n" }, [
		{
			name: 'query-resolver',
			setup(build) {
				build.onResolve({ filter: /^tagged$/ }, () => ({ path: `${tagged}?v=1&at=12:30` }));
				build.onLoad({ filter: /\?v=1/ }, () => ({ contents: 'export const value = 1;', loader: 'ts' }));
			},
		},
		{
			name: 'tagger',
			setup: (build) => build.transform({ filter: /tagged\.ts$/ }, (code) => `/* tagged */\n${code}`),
		},
	]);

	assert.match(chunk.code, /tagged/);
});

test('passes a Windows drive path to callbacks unchanged', async () => {
	const seen: string[] = [];
	const plugins = await createRolldownPluginBridge(
		[
			{
				name: 'drive',
				setup(build) {
					build.transform({ filter: /\.ts$/ }, (code, id) => {
						seen.push(id);
						return `/* tagged */\n${code}`;
					});
					build.onLoad({ filter: /\.txt$/ }, ({ path: loadPath }) => {
						seen.push(loadPath);
						return { contents: 'x', loader: 'js' };
					});
				},
			},
		],
		'/app',
	);

	const transformed = await callTransform(plugins[0]!, 'export {};', 'C:\\app\\src\\a.ts');
	await callLoad(plugins[1]!, 'D:/app/a.txt');

	assert.match(transformed?.code ?? '', /tagged/);
	assert.deepEqual(seen, ['C:\\app\\src\\a.ts', 'D:/app/a.txt']);
});

test('runs onEnd after every module is transformed and fails the build when it throws', async () => {
	const transformed: string[] = [];
	const plugin: EcoBuildPlugin = {
		name: 'end-check',
		setup(build) {
			build.transform({ filter: /\.js$/ }, (code, id) => {
				transformed.push(path.basename(id));
				return code;
			});
			build.onEnd(() => {
				throw new Error(`transformed ${transformed.sort().join(', ')}`);
			});
		},
	};

	await assert.rejects(
		bundle({ 'entry.js': `import './child.js';\nexport const entry = 1;`, 'child.js': `export const child = 1;` }, [
			plugin,
		]),
		/transformed child\.js, entry\.js/,
	);
});

test('skips onEnd when the build already failed', async () => {
	let ended = 0;
	const plugin: EcoBuildPlugin = {
		name: 'end-check',
		setup(build) {
			build.transform({ filter: /\.js$/ }, () => {
				throw new Error('transform failed');
			});
			build.onEnd(() => {
				ended += 1;
			});
		},
	};

	await assert.rejects(bundle({ 'entry.js': `export const entry = 1;` }, [plugin]), /transform failed/);
	assert.equal(ended, 0);
});
