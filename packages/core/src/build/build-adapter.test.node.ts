import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultBuildAdapter, NodeEsbuildBuildAdapter } from './build-adapter.ts';
import type { EcoBuildPluginBuilder } from './build-types.ts';

const testIfNode = process.versions.bun ? test.skip : test;

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

function cleanupTempRoots(): void {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function clearNodeCssBridge(): void {
	return;
}

testIfNode('defaultBuildAdapter uses NodeEsbuildBuildAdapter on Node runtime', () => {
	assert.ok(defaultBuildAdapter instanceof NodeEsbuildBuildAdapter);
});

testIfNode('NodeEsbuildBuildAdapter supports module virtual modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-virtual-module');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, "import answer from 'virtual:answer';\nexport const value = answer;");

		const adapter = new NodeEsbuildBuildAdapter();
		adapter.registerPlugin({
			name: 'virtual-module-test',
			setup(build: EcoBuildPluginBuilder) {
				build.module('virtual:answer', () => ({
					loader: 'object',
					exports: {
						default: 42,
					},
				}));
			},
		});

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /42/);
	} finally {
		cleanupTempRoots();
	}
});

testIfNode('NodeEsbuildBuildAdapter applies registered plugin CSS transforms to imported CSS strings', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-css');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new NodeEsbuildBuildAdapter();
		adapter.registerPlugin({
			name: 'css-bridge-replacement-test',
			setup(build) {
				build.onLoad({ filter: /\.css$/ }, async (args) => {
					const contents = fs.readFileSync(args.path, 'utf-8');
					return {
						loader: 'object',
						exports: {
							default: `/* transformed */\n${contents}`,
						},
					};
				});
			},
		});

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /\/\* transformed \*\//);
		assert.match(outputSource, /\.counter \{ color: red; \}/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

testIfNode('NodeEsbuildBuildAdapter resolves tsconfig path aliases', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-tsconfig-paths');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		const libDir = path.join(srcDir, 'lib');
		fs.mkdirSync(libDir, { recursive: true });

		const tsconfigPath = path.join(root, 'tsconfig.json');
		fs.writeFileSync(
			tsconfigPath,
			JSON.stringify({
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@/*': ['src/*'],
					},
				},
			}),
		);

		const utilPath = path.join(libDir, 'count.ts');
		fs.writeFileSync(utilPath, 'export const count = 7;');

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, "import { count } from '@/lib/count';\nexport const value = count;");

		const adapter = new NodeEsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /7/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

testIfNode('NodeEsbuildBuildAdapter compiles decorated declare fields', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-decorated-declare');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'function legacyDecorator(_target: unknown, _propertyKey: string | symbol) {}',
				'class Counter {',
				'\t@legacyDecorator declare count: number;',
				'}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new NodeEsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

testIfNode('NodeEsbuildBuildAdapter applies plugin CSS transforms for CSS imported in TS modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-plugin-css-transform');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new NodeEsbuildBuildAdapter();
		adapter.registerPlugin({
			name: 'css-transform-test-plugin',
			setup(build) {
				build.onLoad({ filter: /\.css$/ }, async (args) => {
					const contents = fs.readFileSync(args.path, 'utf-8');
					return {
						loader: 'object',
						exports: {
							default: `/* postprocessed */\n${contents}`,
						},
					};
				});
			},
		});

		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /\/\* postprocessed \*\//);
		assert.match(outputSource, /\.counter \{ color: red; \}/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});
