import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDistManifest } from './build-npm-packages.ts';

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
