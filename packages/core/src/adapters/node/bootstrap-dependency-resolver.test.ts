import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
	createNodeBootstrapPlugin,
	getNodeUnsupportedBuiltinError,
	resolveNodeBootstrapDependency,
} from './bootstrap-dependency-resolver.ts';

function writePackage(packageDir: string, options: { name: string; main?: string }) {
	fs.mkdirSync(packageDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({
			name: options.name,
			main: options.main ?? 'index.js',
		}),
		'utf8',
	);
	const entryFilePath = path.join(packageDir, options.main ?? 'index.js');
	fs.mkdirSync(path.dirname(entryFilePath), { recursive: true });
	fs.writeFileSync(entryFilePath, 'export default null;\n', 'utf8');
}

test('resolveNodeBootstrapDependency keeps relative, node, and workspace specifiers in the bundle graph', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');

	try {
		const options = {
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
		};

		assert.equal(resolveNodeBootstrapDependency({ path: './local.ts' }, options), undefined);
		assert.equal(resolveNodeBootstrapDependency({ path: 'node:path' }, options), undefined);
		assert.equal(resolveNodeBootstrapDependency({ path: '@/data/demo-data' }, options), undefined);
		assert.deepEqual(resolveNodeBootstrapDependency({ path: '@ecopages/core' }, options), {
			path: require.resolve('@ecopages/core'),
		});
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency externalizes third-party packages and links them into runtime node_modules', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'packages', 'example', 'src', 'index.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	writePackage(path.join(rootDir, 'node_modules', 'fast-glob'), { name: 'fast-glob', main: 'out/index.js' });

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'fast-glob', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'fast-glob', external: true });
		assert.equal(
			fs.realpathSync(path.join(runtimeNodeModulesDir, 'fast-glob')),
			fs.realpathSync(path.join(rootDir, 'node_modules', 'fast-glob')),
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency resolves workspace-source third-party imports from the app project boundary', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'packages', 'react-plugin', 'src', 'plugin.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	writePackage(path.join(rootDir, 'node_modules', 'react'), { name: 'react', main: 'index.js' });

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'react', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'react', external: true });
		assert.equal(
			fs.realpathSync(path.join(runtimeNodeModulesDir, 'react')),
			fs.realpathSync(path.join(rootDir, 'node_modules', 'react')),
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency resolves nested third-party dependencies from the importer package context', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPackageDir = path.join(rootDir, 'node_modules', 'dep-a');
	writePackage(importerPackageDir, { name: 'dep-a' });
	const nestedDependencyDir = path.join(importerPackageDir, 'node_modules', 'dep-b');
	writePackage(nestedDependencyDir, { name: 'dep-b' });
	const importerPath = path.join(importerPackageDir, 'index.js');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'dep-b', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'dep-b', external: true });
		assert.equal(fs.realpathSync(path.join(runtimeNodeModulesDir, 'dep-b')), fs.realpathSync(nestedDependencyDir));
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createNodeBootstrapPlugin wires the shared resolution policy into an Eco build plugin', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	writePackage(path.join(rootDir, 'node_modules', 'fast-glob'), { name: 'fast-glob', main: 'out/index.js' });

	try {
		const plugin = createNodeBootstrapPlugin({
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
		});

		let onResolveCallback: ((args: { path: string; importer?: string; namespace?: string }) => unknown) | undefined;

		await plugin.setup({
			onResolve(_options, callback) {
				onResolveCallback = callback;
			},
			onLoad() {},
			module() {},
		});

		assert.ok(onResolveCallback);
		assert.deepEqual(onResolveCallback?.({ path: 'fast-glob' }), {
			path: 'fast-glob',
			external: true,
		});
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createNodeBootstrapPlugin rewrites import.meta only for declared bootstrap files', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const bootstrapFile = path.join(rootDir, 'eco.config.ts');
	const regularFile = path.join(rootDir, 'src', 'page.kita.tsx');
	fs.mkdirSync(path.dirname(regularFile), { recursive: true });
	fs.writeFileSync(bootstrapFile, 'export default import.meta.dirname;\n', 'utf8');
	fs.writeFileSync(regularFile, 'export default import.meta.dirname;\n', 'utf8');

	try {
		const plugin = createNodeBootstrapPlugin({
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
			preserveImportMetaPaths: [bootstrapFile],
		});

		let onLoadCallback: ((args: { path: string; namespace?: string }) => Promise<unknown> | unknown) | undefined;

		await plugin.setup({
			onResolve() {},
			onLoad(_options, callback) {
				onLoadCallback = callback;
			},
			module() {},
		});

		assert.ok(onLoadCallback);
		const bootstrapResult = await onLoadCallback?.({ path: bootstrapFile });
		const regularResult = await onLoadCallback?.({ path: regularFile });

		assert.equal(typeof (bootstrapResult as { contents?: string } | undefined)?.contents, 'string');
		assert.equal(
			bootstrapResult && typeof bootstrapResult === 'object' && 'contents' in bootstrapResult
				? String((bootstrapResult as { contents: string }).contents).includes(
						JSON.stringify(path.dirname(bootstrapFile)),
					)
				: false,
			true,
		);
		assert.equal(regularResult, undefined);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createNodeBootstrapPlugin injects side-effect imports for project re-export barrels', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const barrelFile = path.join(rootDir, 'src', 'layouts', 'base-layout', 'index.ts');
	fs.mkdirSync(path.dirname(barrelFile), { recursive: true });
	fs.writeFileSync(
		barrelFile,
		[
			"export * from './base-layout.kita';",
			"export { BaseLayout } from './base-layout.kita';",
			"export type { BaseLayoutProps } from './base-layout.kita';",
		].join('\n'),
		'utf8',
	);

	try {
		const plugin = createNodeBootstrapPlugin({
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
		});

		let onLoadCallback: ((args: { path: string; namespace?: string }) => Promise<unknown> | unknown) | undefined;

		await plugin.setup({
			onResolve() {},
			onLoad(_options, callback) {
				onLoadCallback = callback;
			},
			module() {},
		});

		assert.ok(onLoadCallback);
		const result = await onLoadCallback?.({ path: barrelFile });
		const contents =
			result && typeof result === 'object' && 'contents' in result
				? String((result as { contents: string }).contents)
				: '';

		assert.match(contents, /^import \* as __eco_bootstrap_reexport_0 from '\.\/base-layout\.kita';/m);
		assert.match(contents, /^void __eco_bootstrap_reexport_0;$/m);
		assert.match(contents, /export \* from '\.\/base-layout\.kita';/);
		assert.match(contents, /export \{ BaseLayout \} from '\.\/base-layout\.kita';/);
		assert.match(contents, /export type \{ BaseLayoutProps \} from '\.\/base-layout\.kita';/);
		assert.equal(
			contents.match(/import \* as __eco_bootstrap_reexport_0 from '\.\/base-layout\.kita';/g)?.length,
			1,
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createNodeBootstrapPlugin fails fast on Bun-only builtins', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'db.server.ts');

	try {
		const plugin = createNodeBootstrapPlugin({
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
		});

		let onResolveCallback: ((args: { path: string; importer?: string; namespace?: string }) => unknown) | undefined;

		await plugin.setup({
			onResolve(options, callback) {
				if (String(options.filter) === String(/^bun:/)) {
					onResolveCallback = callback;
				}
			},
			onLoad() {},
			module() {},
		});

		assert.ok(onResolveCallback);
		assert.throws(
			() => onResolveCallback?.({ path: 'bun:sqlite', importer: importerPath }),
			new RegExp(
				getNodeUnsupportedBuiltinError('bun:sqlite', importerPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
			),
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
