import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDistManifest, findTestRunnerImports, findUnresolvedRelativeImports } from './build-npm-packages.ts';

test('findUnresolvedRelativeImports reports relative targets missing from the tarball', () => {
	const packed = new Set(['src/a.js', 'src/lib/b.js', 'src/lib/c.js', 'src/data.json']);
	const source = [
		`import { b } from './lib/b.js';`,
		`export * from './lib/dist-missing.js';`,
		`import './data.json';`,
		`const lazy = () => import('../src/lib/c.js');`,
		`const gone = () => import("./gone.js");`,
		`import { x } from '@ecopages/core';`,
		`/** Example: import './in-comment.css' */`,
		`write('import "./generated.d.js";');`,
		"const generated = `await import('./${SERVER_BUNDLE_IMPLEMENTATION_FILENAME}')`;",
		"const templated = `result: ${import('./missing-template-expression.js')}`;",
	].join('\n');

	assert.deepEqual(findUnresolvedRelativeImports('src/a.js', source, packed), [
		'src/lib/dist-missing.js',
		'src/gone.js',
		'src/missing-template-expression.js',
	]);
});

test('findTestRunnerImports ignores generated source strings', () => {
	const source = [
		`import { test } from 'vitest';`,
		`export { vi } from 'vitest/browser';`,
		`const dynamic = () => import('vitest/utils');`,
		"const generated = `import('vitest')`;",
	].join('\n');

	assert.deepEqual(findTestRunnerImports('src/a.js', source), ['vitest', 'vitest/browser', 'vitest/utils']);
});

test('createDistManifest strips development-only manifest fields', () => {
	const distManifest = createDistManifest(
		{
			name: '@ecopages/example',
			private: true,
			files: ['src'],
			scripts: { build: 'tsc' },
			devDependencies: {
				vitest: '^4.1.6',
			},
			main: './src/index.ts',
			type: 'module',
		},
		'1.2.3',
	);

	assert.equal(distManifest.version, '1.2.3');
	assert.equal('private' in distManifest, false);
	assert.equal('files' in distManifest, false);
	assert.equal('scripts' in distManifest, false);
	assert.equal('devDependencies' in distManifest, false);
	assert.equal(distManifest.main, './src/index.js');
});

test('createDistManifest keeps publish access and drops directory', () => {
	const distManifest = createDistManifest(
		{
			name: '@ecopages/example',
			main: './src/index.ts',
			publishConfig: {
				access: 'public',
				directory: 'dist',
			},
		},
		'1.2.3',
	);

	assert.deepEqual(distManifest.publishConfig, {
		access: 'public',
	});
});

test('createDistManifest rewrites workspace ranges but preserves publish metadata', () => {
	const distManifest = createDistManifest(
		{
			name: '@ecopages/example',
			dependencies: {
				'@ecopages/core': 'workspace:*',
			},
			peerDependencies: {
				'@ecopages/runtime': 'workspace:*',
			},
			optionalDependencies: {
				'@ecopages/optional-runtime': 'workspace:*',
			},
			peerDependenciesMeta: {
				'@ecopages/runtime': {
					optional: true,
				},
			},
			overrides: {
				esbuild: '^0.28.0',
			},
			exports: {
				'.': {
					default: './src/index.ts',
					types: './src/index.ts',
				},
			},
		},
		'9.9.9',
	);

	assert.deepEqual(distManifest.dependencies, {
		'@ecopages/core': '9.9.9',
	});
	assert.deepEqual(distManifest.peerDependencies, {
		'@ecopages/runtime': '9.9.9',
	});
	assert.deepEqual(distManifest.optionalDependencies, {
		'@ecopages/optional-runtime': '9.9.9',
	});
	assert.deepEqual(distManifest.peerDependenciesMeta, {
		'@ecopages/runtime': {
			optional: true,
		},
	});
	assert.deepEqual(distManifest.overrides, {
		esbuild: '^0.28.0',
	});
	assert.deepEqual(distManifest.exports, {
		'.': {
			default: './src/index.js',
			types: './src/index.d.ts',
		},
	});
});

test('createDistManifest drops internal subpaths from the published exports', () => {
	const distManifest = createDistManifest(
		{
			name: '@ecopages/example',
			exports: {
				'.': './src/index.ts',
				'./config': './src/config/index.ts',
				'./internal/finalize-config': './src/config/assembly/finalize-config.ts',
			},
		},
		'1.2.3',
	);

	const exportKeys = Object.keys(distManifest.exports as Record<string, unknown>);
	assert.equal(exportKeys.includes('./config'), true);
	assert.equal(
		exportKeys.some((key) => key.startsWith('./internal/')),
		false,
	);
});
