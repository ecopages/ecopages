import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { createBuildRequestIdentity } from './build-request-identity.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { EcoSourceTransform } from '../../plugins/source-transform.ts';

const baseOptions: BuildOptions = {
	entrypoints: ['/in/a.ts'],
	root: '/in',
	outdir: '/out',
	target: 'browser',
	format: 'esm',
	sourcemap: 'none',
};

test('createBuildRequestIdentity treats entrypoint order as equivalent', () => {
	const keyA = createBuildRequestIdentity({
		...baseOptions,
		entrypoints: ['/in/a.ts', '/in/b.ts'],
	});
	const keyB = createBuildRequestIdentity({
		...baseOptions,
		entrypoints: ['/in/b.ts', '/in/a.ts'],
	});

	assert.equal(keyA, keyB);
});

test('createBuildRequestIdentity distinguishes output-affecting fields', () => {
	const cases: Array<{ field: keyof BuildOptions; left: unknown; right: unknown }> = [
		{ field: 'conditions', left: ['browser'], right: ['node'] },
		{
			field: 'define',
			left: { 'process.env.NODE_ENV': '"production"' },
			right: { 'process.env.NODE_ENV': '"development"' },
		},
		{ field: 'external', left: ['react'], right: ['react-dom'] },
		{ field: 'jsx', left: { importSource: 'react' }, right: { importSource: 'preact' } },
		{ field: 'minify', left: true, right: false },
		{ field: 'treeshaking', left: true, right: false },
		{ field: 'naming', left: '[name].js', right: '[name]-[hash].js' },
	];

	for (const { field, left, right } of cases) {
		const leftKey = createBuildRequestIdentity({ ...baseOptions, [field]: left });
		const rightKey = createBuildRequestIdentity({ ...baseOptions, [field]: right });
		assert.notEqual(leftKey, rightKey, `expected different keys for ${String(field)}`);
	}
});

test('createBuildRequestIdentity preserves plugin order', () => {
	const pluginA: EcoBuildPlugin = { name: 'a', setup() {} };
	const pluginB: EcoBuildPlugin = { name: 'b', setup() {} };

	const forward = createBuildRequestIdentity({ ...baseOptions, plugins: [pluginA, pluginB] });
	const reverse = createBuildRequestIdentity({ ...baseOptions, plugins: [pluginB, pluginA] });

	assert.notEqual(forward, reverse);
});

test('createBuildRequestIdentity preserves conditions order', () => {
	const keyA = createBuildRequestIdentity({
		...baseOptions,
		conditions: ['import', 'node'],
	});
	const keyB = createBuildRequestIdentity({
		...baseOptions,
		conditions: ['node', 'import'],
	});

	assert.notEqual(keyA, keyB);
});

test('createBuildRequestIdentity treats external membership as unordered', () => {
	const keyA = createBuildRequestIdentity({
		...baseOptions,
		external: ['react', 'react-dom'],
	});
	const keyB = createBuildRequestIdentity({
		...baseOptions,
		external: ['react-dom', 'react'],
	});

	assert.equal(keyA, keyB);
});

test('createBuildRequestIdentity fingerprints plugin setup and source transforms', () => {
	const transformA: EcoSourceTransform = {
		name: 'transform-a',
		filter: /\.tsx$/u,
		transform(code) {
			return code;
		},
	};
	const transformB: EcoSourceTransform = {
		name: 'transform-b',
		filter: /\.tsx$/u,
		transform(code) {
			return `${code}//changed`;
		},
	};

	assert.notEqual(
		createBuildRequestIdentity({
			...baseOptions,
			plugins: [{ name: 'same-name', setup() {} }],
		}),
		createBuildRequestIdentity({
			...baseOptions,
			plugins: [
				{
					name: 'same-name',
					setup(build) {
						build.onLoad({ filter: /\.ts$/u }, () => undefined);
					},
				},
			],
		}),
	);
	assert.notEqual(
		createBuildRequestIdentity({ ...baseOptions, sourceTransforms: [transformA] }),
		createBuildRequestIdentity({ ...baseOptions, sourceTransforms: [transformB] }),
	);
});
