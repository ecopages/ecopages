import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { collectBuildOutputImports, getBuildEntryOutput } from './build-graph.ts';
import { RolldownBuildAdapter } from './rolldown/rolldown-build-adapter.ts';
import { RouteModuleBuildCache } from '../services/module-loading/route-module-build-cache.store.ts';
import { resolveRouteModuleDependencyPaths } from '../services/module-loading/route-module-dependency-hasher.ts';

let root: string;
beforeEach(() => {
	root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ecopages-build-graph-')));
	vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

test('both persisted entries miss after their shared inlined source changes', async () => {
	const shared = path.join(root, 'shared.js');
	writeFileSync(shared, "export const value = 'before';");
	const entries = ['blog', 'blog-post'].map((name) => {
		const entry = path.join(root, `${name}.js`);
		writeFileSync(entry, "import { value } from './shared.js'; export const read = () => value;");
		return entry;
	});
	const outdir = path.join(root, 'dist');
	const result = await new RolldownBuildAdapter().build({
		entrypoints: entries,
		root,
		outdir,
		target: 'node',
		splitting: true,
	});
	expect(result.success).toBe(true);
	const cache = new RouteModuleBuildCache(outdir);
	for (const entry of entries) {
		const output = getBuildEntryOutput(result, entry, root);
		if (!output) throw new Error(`Missing output for ${entry}`);
		const options = { filePath: entry, rootDir: root, outdir, fileHash: fileSystem.hash(entry) };
		cache.recordBuild({
			...options,
			outputPath: output,
			dependencyModulePaths: resolveRouteModuleDependencyPaths(result, entry, root),
			outputImports: collectBuildOutputImports(result, output),
		});
		expect(cache.lookup(options)?.outputPath).toBe(output);
	}
	writeFileSync(shared, "export const value = 'after';");
	const restored = new RouteModuleBuildCache(outdir);
	for (const entry of entries)
		expect(
			restored.lookup({ filePath: entry, rootDir: root, outdir, fileHash: fileSystem.hash(entry) }),
		).toBeUndefined();
});

test('a missing local external generated module invalidates a persisted build', async () => {
	const generated = path.join(root, 'generated.mjs');
	writeFileSync(generated, "export const value = 'generated';");
	const entry = path.join(root, 'entry.js');
	writeFileSync(
		entry,
		`import { value } from ${JSON.stringify(pathToFileURL(generated).href)}; export const read = () => value;`,
	);
	const outdir = path.join(root, 'dist');
	const result = await new RolldownBuildAdapter().build({
		entrypoints: [entry],
		root,
		outdir,
		target: 'node',
		external: [pathToFileURL(generated).href],
	});
	expect(result.success).toBe(true);
	const output = getBuildEntryOutput(result, entry, root);
	if (!output) throw new Error('Missing entry output');
	const imports = collectBuildOutputImports(result, output);
	expect(imports).toContain(generated);
	const options = { filePath: entry, rootDir: root, outdir, fileHash: fileSystem.hash(entry) };
	const cache = new RouteModuleBuildCache(outdir);
	cache.recordBuild({
		...options,
		outputPath: output,
		dependencyModulePaths: resolveRouteModuleDependencyPaths(result, entry, root),
		outputImports: imports,
	});
	expect(cache.lookup(options)?.outputPath).toBe(output);
	rmSync(generated);
	expect(new RouteModuleBuildCache(outdir).lookup(options)).toBeUndefined();
});

test('walks static and dynamic chunk edges through cycles and retains missing leaves', () => {
	const output = path.join(root, 'entry.js');
	const shared = path.join(root, 'shared.js');
	const lazy = path.join(root, 'lazy.js');
	const missing = path.join(root, 'missing.mjs');
	const chunk = (fileName: string, imports: string[], dynamicImports: string[]) => ({
		fileName,
		imports,
		dynamicImports,
		isEntry: fileName === output,
		facadeModuleId: null,
	});
	const graph = {
		outputGraph: {
			[output]: chunk(output, [shared, 'react'], [lazy]),
			[shared]: chunk(shared, [output, pathToFileURL(missing).href], []),
			[lazy]: chunk(lazy, [shared], []),
		},
	};
	expect(collectBuildOutputImports(graph, output).sort()).toEqual([shared, lazy, missing].sort());
});

test('finds the entry output through a symlink root and by the name the caller passed', async () => {
	const parent = mkdtempSync(path.join(tmpdir(), 'ecopages-build-graph-link-'));
	try {
		const realRoot = path.join(parent, 'real');
		const linkRoot = path.join(parent, 'link');
		mkdirSync(realRoot);
		writeFileSync(path.join(realRoot, 'entry.js'), 'export const value = 1;');
		symlinkSync(realRoot, linkRoot);
		const entry = path.join(linkRoot, 'entry.js');
		const outdir = path.join(linkRoot, 'dist');
		const result = await new RolldownBuildAdapter().build({
			entrypoints: { pages__blog: entry },
			root: linkRoot,
			outdir,
			target: 'node',
		});
		expect(result.success, JSON.stringify(result.logs)).toBe(true);
		const byPath = getBuildEntryOutput(result, entry, linkRoot);
		const byName = getBuildEntryOutput(result, 'pages__blog', linkRoot);
		expect(byPath).toBeDefined();
		expect(byName).toBe(byPath);
		expect(byPath).toContain(path.sep);
	} finally {
		rmSync(parent, { recursive: true, force: true });
	}
});
