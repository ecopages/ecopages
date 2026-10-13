import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { createBuildRequestIdentity } from './build-request-identity.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import { createEcoBuildPluginFromSourceTransform } from '../../plugins/source-transform.ts';
import { createForeignJsxOverridePlugin } from '../../plugins/foreign-jsx-override-plugin.ts';
import { createPreserveImportMetaTransform } from '../preserve-import-meta-transform.ts';

const baseOptions: BuildOptions = {
	environment: 'browser' as const,
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

test('createBuildRequestIdentity distinguishes every BuildOptions field', () => {
	const fields = {
		environment: ['server', 'browser'],
		entrypoints: [['/in/a.ts'], { a: '/in/a.ts' }],
		outdir: ['/out', '/other'],
		naming: ['[name].js', '[name]-[hash].js'],
		conditions: [['browser'], ['node']],
		define: [{ A: '1' }, { A: '2' }],
		minify: [true, false],
		treeshaking: [true, false],
		target: ['browser', 'node'],
		format: ['esm', 'cjs'],
		sourcemap: ['none', 'linked'],
		splitting: [true, false],
		root: ['/in', '/other'],
		externalPackages: [true, false],
		reportPackagesOutsideRoot: [true, false],
		runtimeOutdir: ['/runtime-a', '/runtime-b'],
		writeToDisk: [true, false],
		external: [['react'], ['react-dom']],
		jsx: [{ importSource: 'react' }, { importSource: 'preact' }],
	} satisfies Record<Exclude<keyof BuildOptions, 'plugins'>, [unknown, unknown]>;

	for (const [field, [left, right]] of Object.entries(fields)) {
		assert.notEqual(
			createBuildRequestIdentity({ ...baseOptions, [field]: left }),
			createBuildRequestIdentity({ ...baseOptions, [field]: right }),
			`expected different identities for ${field}`,
		);
	}
});

test('createBuildRequestIdentity treats unset and empty collections alike', () => {
	assert.equal(
		createBuildRequestIdentity({ ...baseOptions, conditions: [], define: {}, external: [], plugins: [] }),
		createBuildRequestIdentity(baseOptions),
	);
});

test('createBuildRequestIdentity tells apart plugins of one name by cacheKey', () => {
	const make = (cacheKey?: string): EcoBuildPlugin => ({ name: 'factory-plugin', cacheKey, setup() {} });

	assert.notEqual(
		createBuildRequestIdentity({ ...baseOptions, plugins: [make('a')] }),
		createBuildRequestIdentity({ ...baseOptions, plugins: [make('b')] }),
	);
	assert.equal(
		createBuildRequestIdentity({ ...baseOptions, plugins: [make('a')] }),
		createBuildRequestIdentity({ ...baseOptions, plugins: [make('a')] }),
	);
});

test('createBuildRequestIdentity tells apart import.meta transforms of different runtime directories', () => {
	const identityFor = (runtimeDir: string) =>
		createBuildRequestIdentity({
			...baseOptions,
			plugins: [createEcoBuildPluginFromSourceTransform(createPreserveImportMetaTransform(runtimeDir))],
		});

	assert.notEqual(identityFor('/out/a'), identityFor('/out/b'));
	assert.equal(identityFor('/out/a'), identityFor('/out/a'));
});

test('createBuildRequestIdentity tells apart foreign JSX overrides built from different options', () => {
	const identityFor = (hostJsxImportSource: string) =>
		createBuildRequestIdentity({
			...baseOptions,
			plugins: [createForeignJsxOverridePlugin({ hostJsxImportSource, foreignExtensions: ['.kita.tsx'] })],
		});

	assert.notEqual(identityFor('react'), identityFor('preact'));
});
