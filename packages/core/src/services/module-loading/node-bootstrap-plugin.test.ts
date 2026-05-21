import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
	createNodeBootstrapPlugin,
	getNodeUnsupportedBuiltinError,
	resolveNodeBootstrapDependency,
} from './node-bootstrap-plugin.ts';

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
			path: fileURLToPath(import.meta.resolve('@ecopages/core')),
		});
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency externalizes third-party packages without runtime node_modules links', () => {
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
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency preserves extensionless deep package imports for Node to resolve', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const packageDir = path.join(rootDir, 'node_modules', 'esm-deep-tool');
	fs.mkdirSync(path.join(packageDir, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({ name: 'esm-deep-tool', type: 'module' }),
		'utf8',
	);
	fs.writeFileSync(path.join(packageDir, 'feature.js'), "export { value } from './lib/value.js';\n", 'utf8');
	fs.writeFileSync(path.join(packageDir, 'lib', 'value.js'), 'export const value = 42;\n', 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'esm-deep-tool/feature', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'esm-deep-tool/feature', external: true });
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency preserves exported package subpaths without appending .js', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const packageDir = path.join(rootDir, 'node_modules', 'react-like');
	fs.mkdirSync(packageDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({
			name: 'react-like',
			type: 'module',
			exports: {
				'./jsx-runtime': './jsx-runtime.js',
			},
		}),
		'utf8',
	);
	fs.writeFileSync(path.join(packageDir, 'jsx-runtime.js'), 'export const jsx = true;\n', 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'react-like/jsx-runtime', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'react-like/jsx-runtime', external: true });
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency keeps explicit deep package extensions unchanged', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const packageDir = path.join(rootDir, 'node_modules', 'three-like');
	fs.mkdirSync(path.join(packageDir, 'examples', 'jsm'), { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({ name: 'three-like', type: 'module' }),
		'utf8',
	);
	fs.writeFileSync(path.join(packageDir, 'examples', 'jsm', 'Loader.js'), 'export const loader = true;\n', 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'three-like/examples/jsm/Loader.js', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'three-like/examples/jsm/Loader.js', external: true });
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
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
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency resolves workspace package dependencies from the importer package boundary', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	const appProjectDir = path.join(rootDir, 'playground', 'kitchen-sink');
	fs.mkdirSync(appProjectDir, { recursive: true });
	fs.writeFileSync(path.join(appProjectDir, 'package.json'), '{}', 'utf8');
	const frameworkPackageDir = path.join(rootDir, 'packages', 'core');
	const importerPath = path.join(frameworkPackageDir, 'src', 'plugin.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	fs.writeFileSync(
		path.join(frameworkPackageDir, 'package.json'),
		JSON.stringify({ name: '@ecopages/core' }),
		'utf8',
	);
	writePackage(path.join(frameworkPackageDir, 'node_modules', 'oxc-parser'), {
		name: 'oxc-parser',
		main: 'index.js',
	});

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'oxc-parser', importer: importerPath },
			{ projectDir: appProjectDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'oxc-parser', external: true });
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency resolves external @ecopages subpaths to concrete files', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	const appProjectDir = path.join(rootDir, 'apps', 'docs');
	fs.mkdirSync(appProjectDir, { recursive: true });
	fs.writeFileSync(path.join(appProjectDir, 'package.json'), '{}', 'utf8');
	const jsxPackageDir = path.join(rootDir, 'node_modules', '@ecopages', 'jsx');
	fs.mkdirSync(jsxPackageDir, { recursive: true });
	fs.writeFileSync(
		path.join(jsxPackageDir, 'package.json'),
		JSON.stringify({
			name: '@ecopages/jsx',
			type: 'module',
			exports: {
				'.': {
					import: './index.js',
				},
				'./jsx-runtime': {
					import: './jsx-runtime.js',
				},
			},
		}),
		'utf8',
	);
	fs.writeFileSync(path.join(jsxPackageDir, 'index.js'), 'export const jsx = true;\n', 'utf8');
	fs.writeFileSync(path.join(jsxPackageDir, 'jsx-runtime.js'), 'export const runtime = true;\n', 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: '@ecopages/jsx/jsx-runtime', importer: path.join(appProjectDir, 'entry.js') },
			{ projectDir: appProjectDir, runtimeNodeModulesDir },
		);

		assert.equal(
			result?.path ? fs.realpathSync(result.path) : result?.path,
			fs.realpathSync(path.join(jsxPackageDir, 'jsx-runtime.js')),
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency externalizes import-only @ecopages packages from the app package boundary', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	const appProjectDir = path.join(rootDir, 'apps', 'docs');
	fs.mkdirSync(appProjectDir, { recursive: true });
	fs.writeFileSync(path.join(appProjectDir, 'package.json'), '{}', 'utf8');
	const jsxPackageDir = path.join(appProjectDir, 'node_modules', '@ecopages', 'jsx');
	fs.mkdirSync(jsxPackageDir, { recursive: true });
	fs.writeFileSync(
		path.join(jsxPackageDir, 'package.json'),
		JSON.stringify({
			name: '@ecopages/jsx',
			type: 'module',
			exports: {
				'.': {
					import: './index.js',
				},
			},
		}),
		'utf8',
	);
	fs.writeFileSync(path.join(jsxPackageDir, 'index.js'), 'export const jsx = true;\n', 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: '@ecopages/jsx', importer: path.join(appProjectDir, 'src', 'entry.tsx') },
			{ projectDir: appProjectDir, runtimeNodeModulesDir },
		);

		assert.equal(
			result?.path ? fs.realpathSync(result.path) : result?.path,
			fs.realpathSync(path.join(jsxPackageDir, 'index.js')),
		);
		assert.equal(fs.existsSync(path.join(runtimeNodeModulesDir, '@ecopages', 'jsx')), false);
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
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency leaves package roots to Node when the entry lives under a nested manifest', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.ts');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const packageDir = path.join(rootDir, 'node_modules', 'postgres');
	writePackage(packageDir, { name: 'postgres', main: 'cjs/src/index.js' });
	fs.writeFileSync(path.join(packageDir, 'cjs', 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');

	try {
		const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
		const result = resolveNodeBootstrapDependency(
			{ path: 'postgres', importer: importerPath },
			{ projectDir: rootDir, runtimeNodeModulesDir },
		);

		assert.deepEqual(result, { path: 'postgres', external: true });
		assert.equal(fs.existsSync(runtimeNodeModulesDir), false);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency does not refresh runtime links for third-party packages', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.tsx');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const firstPackageDir = path.join(rootDir, 'store', 'react-v1');
	const secondPackageDir = path.join(rootDir, 'store', 'react-v2');
	writePackage(firstPackageDir, { name: 'react' });
	writePackage(secondPackageDir, { name: 'react' });
	const nodeModulesDir = path.join(rootDir, 'node_modules');
	const appReactLinkPath = path.join(nodeModulesDir, 'react');
	const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
	const runtimeReactLinkPath = path.join(runtimeNodeModulesDir, 'react');
	fs.mkdirSync(nodeModulesDir, { recursive: true });
	fs.mkdirSync(runtimeNodeModulesDir, { recursive: true });
	fs.symlinkSync(secondPackageDir, appReactLinkPath, 'dir');
	fs.symlinkSync(firstPackageDir, runtimeReactLinkPath, 'dir');

	try {
		assert.deepEqual(
			resolveNodeBootstrapDependency(
				{ path: 'react', importer: importerPath },
				{ projectDir: rootDir, runtimeNodeModulesDir },
			),
			{ path: 'react', external: true },
		);
		assert.equal(fs.realpathSync(path.join(runtimeNodeModulesDir, 'react')), fs.realpathSync(firstPackageDir));
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveNodeBootstrapDependency leaves dangling runtime symlinks untouched for third-party packages', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const importerPath = path.join(rootDir, 'src', 'page.tsx');
	fs.mkdirSync(path.dirname(importerPath), { recursive: true });
	fs.writeFileSync(importerPath, 'export default null;\n', 'utf8');
	const packageDir = path.join(rootDir, 'node_modules', 'react');
	const staleTargetDir = path.join(rootDir, 'store', 'react-stale');
	const runtimeNodeModulesDir = path.join(rootDir, '.eco', 'node_modules');
	const runtimeReactLinkPath = path.join(runtimeNodeModulesDir, 'react');
	writePackage(packageDir, { name: 'react' });
	fs.mkdirSync(path.dirname(runtimeReactLinkPath), { recursive: true });
	fs.symlinkSync(staleTargetDir, runtimeReactLinkPath, 'dir');

	try {
		assert.deepEqual(
			resolveNodeBootstrapDependency(
				{ path: 'react', importer: importerPath },
				{ projectDir: rootDir, runtimeNodeModulesDir },
			),
			{ path: 'react', external: true },
		);
		assert.equal(fs.lstatSync(runtimeReactLinkPath).isSymbolicLink(), true);
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

test('createNodeBootstrapPlugin does not rewrite import.meta for project source files', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-bootstrap-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	const bootstrapFile = path.join(rootDir, 'eco.config.ts');
	const regularFile = path.join(rootDir, 'src', 'page.kita.tsx');
	fs.mkdirSync(path.dirname(regularFile), { recursive: true });
	fs.writeFileSync(
		bootstrapFile,
		'export default [import.meta.env, import.meta.dir, import.meta.dirname, import.meta.path, import.meta.filename];\n',
		'utf8',
	);
	fs.writeFileSync(
		regularFile,
		'export default [import.meta.env, import.meta.dir, import.meta.dirname, import.meta.path, import.meta.filename];\n',
		'utf8',
	);

	try {
		const plugin = createNodeBootstrapPlugin({
			projectDir: rootDir,
			runtimeNodeModulesDir: path.join(rootDir, '.eco', 'node_modules'),
		});

		let onLoadRegistered = false;

		await plugin.setup({
			onResolve() {},
			onLoad() {
				onLoadRegistered = true;
			},
			module() {},
		});

		assert.equal(onLoadRegistered, false);
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
