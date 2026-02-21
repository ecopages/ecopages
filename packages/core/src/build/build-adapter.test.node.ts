import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeTest from 'node:test';
import { defaultBuildAdapter, EsbuildBuildAdapter } from './build-adapter.ts';
import type { EcoBuildPluginBuilder } from './build-types.ts';

const test = process.versions.bun ? nodeTest.skip : nodeTest;

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

test('defaultBuildAdapter uses EsbuildBuildAdapter on Node runtime', () => {
	assert.ok(defaultBuildAdapter instanceof EsbuildBuildAdapter);
});

test('EsbuildBuildAdapter supports module virtual modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-virtual-module');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, "import answer from 'virtual:answer';\nexport const value = answer;");

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter applies registered plugin CSS transforms to imported CSS strings', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-css');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter resolves tsconfig path aliases', async () => {
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

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter compiles decorated declare fields', async () => {
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

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter compiles decorated accessor fields', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-decorated-accessor');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'function property(_options: unknown) {',
				'\treturn function (_target: unknown, _context: unknown) {};',
				'}',
				'class Counter {',
				'\t@property({ type: Number }) accessor count = 0;',
				'}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter downlevels accessor fields for browser target bundles', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-browser-accessor');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(
			entryPath,
			[
				'class Counter {',
				'\taccessor count = 0;',
				'}',
				'export const ready = typeof Counter === "function";',
			].join('\n'),
		);

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.doesNotMatch(outputSource, /accessor\s+count/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter applies plugin CSS transforms for CSS imported in TS modules', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-plugin-css-transform');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();
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

test('EsbuildBuildAdapter returns dependency graph entrypoint mapping', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-dependency-graph');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const sharedPath = path.join(srcDir, 'shared.ts');
		const leafPath = path.join(srcDir, 'leaf.ts');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(sharedPath, "import { leaf } from './leaf';\nexport const shared = leaf + 1;");
		fs.writeFileSync(leafPath, 'export const leaf = 2;');
		fs.writeFileSync(entryPath, "import { shared } from './shared';\nexport const value = shared;");

		const adapter = new EsbuildBuildAdapter();
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
		assert.ok(result.dependencyGraph);

		const dependencies = result.dependencyGraph?.entrypoints[path.resolve(entryPath)] ?? [];

		assert.ok(dependencies.includes(path.resolve(entryPath)));
		assert.ok(dependencies.includes(path.resolve(sharedPath)));
		assert.ok(dependencies.includes(path.resolve(leafPath)));
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter prioritizes per-build plugins over registered plugins', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-plugin-precedence');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const cssPath = path.join(srcDir, 'styles.css');
		const entryPath = path.join(srcDir, 'entry.ts');

		fs.writeFileSync(cssPath, '.counter { color: red; }');
		fs.writeFileSync(entryPath, "import styles from './styles.css';\nexport const cssText = styles;");

		const adapter = new EsbuildBuildAdapter();
		adapter.registerPlugin({
			name: 'registered-css-plugin',
			setup(build) {
				build.onLoad({ filter: /\.css$/ }, async () => {
					return {
						loader: 'object',
						exports: {
							default: 'registered-css',
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
			plugins: [
				{
					name: 'build-css-plugin',
					setup(build) {
						build.onLoad({ filter: /\.css$/ }, async () => {
							return {
								loader: 'object',
								exports: {
									default: 'build-css',
								},
							};
						});
					},
				},
			],
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);

		const outputSource = fs.readFileSync(outputPath, 'utf-8');
		assert.match(outputSource, /build-css/);
		assert.doesNotMatch(outputSource, /registered-css/);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});

test('EsbuildBuildAdapter resolves templated naming patterns to concrete output files', async () => {
	try {
		const root = createTempRoot('ecopages-esbuild-naming-template');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });

		const entryPath = path.join(srcDir, 'entry.ts');
		fs.writeFileSync(entryPath, 'export const value = 1;');

		const adapter = new EsbuildBuildAdapter();
		const result = await adapter.build({
			entrypoints: [entryPath],
			root,
			outdir: outDir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: true,
			minify: false,
			naming: '[name].[ext]',
		});

		assert.equal(result.success, true);

		const outputPath = result.outputs.find((output) => output.path.endsWith('entry.js'))?.path;
		assert.ok(outputPath);
		assert.equal(fs.existsSync(path.join(outDir, '[name].[ext]')), false);
	} finally {
		cleanupTempRoots();
		clearNodeCssBridge();
	}
});
