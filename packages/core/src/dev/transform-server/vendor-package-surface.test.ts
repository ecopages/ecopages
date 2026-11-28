import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectModuleClosure } from './vendor-module-effects.ts';
import { countPackageModules, findOwningPackageDir, resolvePackageSurface } from './vendor-package-surface.ts';

const roots: string[] = [];

function createPackage(manifest: Record<string, unknown>, files: Record<string, string>): string {
	const root = path.fromNative(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-surface-'))));
	roots.push(root);
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'surface-lib', ...manifest }));
	for (const [file, contents] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), contents);
	}
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('resolvePackageSurface', () => {
	it('lists the scripts of the exports field under the conditions of the graph, in the order the field lists them', () => {
		const root = createPackage(
			{
				exports: {
					'.': { browser: './browser.js', import: './module.js', require: './main.cjs' },
					'./sub': { node: './node.js', default: './sub.js' },
					'./styles.css': './styles.css',
					'./package.json': './package.json',
				},
			},
			{ 'browser.js': '', 'module.js': '', 'main.cjs': '', 'node.js': '', 'sub.js': '', 'styles.css': '' },
		);

		expect(resolvePackageSurface(root, ['browser', 'import', 'default'], 100)).toEqual([
			path.join(root, 'browser.js'),
			path.join(root, 'sub.js'),
		]);
		expect(resolvePackageSurface(root, ['import', 'default'], 100)).toEqual([
			path.join(root, 'module.js'),
			path.join(root, 'sub.js'),
		]);
	});

	it('expands a wildcard subpath to the files it names and leaves out a target that is missing or outside the package', () => {
		const root = createPackage(
			{
				exports: {
					'./icons/*': './dist/icons/*.js',
					'./missing': './nowhere.js',
					'./outside': '../outside.js',
				},
			},
			{ 'dist/icons/a.js': '', 'dist/icons/b.js': '', 'dist/icons/readme.md': '' },
		);

		expect(resolvePackageSurface(root, ['import', 'default'], 100).sort()).toEqual([
			path.join(root, 'dist/icons/a.js'),
			path.join(root, 'dist/icons/b.js'),
		]);
	});

	it('has no surface without an exports field', () => {
		const root = createPackage({ main: 'index.js' }, { 'index.js': '' });

		expect(resolvePackageSurface(root, ['import', 'default'], 100)).toEqual([]);
	});
});

describe('findOwningPackageDir and countPackageModules', () => {
	it('skips a manifest that only sets the module type, and counts scripts outside node_modules', () => {
		const root = createPackage(
			{ exports: './dist/esm/index.js' },
			{
				'dist/esm/package.json': JSON.stringify({ type: 'module' }),
				'dist/esm/index.js': '',
				'dist/cjs/index.cjs': '',
				'node_modules/dep/index.js': '',
				'readme.md': '',
			},
		);

		expect(findOwningPackageDir(path.join(root, 'dist/esm/index.js'))).toBe(root);
		expect(countPackageModules(root, 100)).toBe(2);
		expect(countPackageModules(root, 1)).toBeGreaterThan(1);
	});
});

describe('inspectModuleClosure', () => {
	it('flags a module with a top-level statement that is not a declaration, also through its own imports', () => {
		const root = createPackage(
			{},
			{
				'pure.js':
					"import { value } from './value.js';\nexport const doubled = value * 2;\nexport default function f() {}\n",
				'value.js': "'use strict';\nexport const value = 1;\n",
				'registers.js': "customElements.define('x-a', class extends HTMLElement {});\nexport {};\n",
				'indirect.js': "import './registers.js';\nexport const x = 1;\n",
				'guarded.js': "if (typeof window !== 'undefined') window.flag = true;\nexport const y = 1;\n",
				'commonjs.js': 'module.exports = { run() { globalThis.ran = true; } };\n',
			},
		);
		const effects = (file: string) => inspectModuleClosure(path.join(root, file)).loadTimeEffects;

		expect(effects('pure.js')).toBe(false);
		expect(effects('registers.js')).toBe(true);
		expect(effects('indirect.js')).toBe(true);
		expect(effects('guarded.js')).toBe(true);
		expect(effects('commonjs.js')).toBe(false);
	});

	it('flags a module that imports a Node builtin, also through its own imports', () => {
		const root = createPackage(
			{},
			{
				'cli.js': "import { readFileSync } from 'node:fs';\nexport const read = () => readFileSync('x');\n",
				'indirect.js': "export { read } from './cli.js';\n",
				'plain.js': "import { join } from './plain-helper.js';\nexport const joined = join;\n",
				'plain-helper.js': 'export const join = (a, b) => a + b;\n',
				'old-style.js': "import path from 'path';\nexport default path;\n",
			},
		);
		const builtin = (file: string) => inspectModuleClosure(path.join(root, file)).nodeBuiltin;

		expect(builtin('cli.js')).toBe(true);
		expect(builtin('indirect.js')).toBe(true);
		expect(builtin('old-style.js')).toBe(true);
		expect(builtin('plain.js')).toBe(false);
	});
});
