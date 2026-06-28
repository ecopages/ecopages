import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'vitest';
import { createDistManifest } from './build-npm-packages.ts';
import { copyBundledDependenciesToDist, getBundleDependencyNames } from './bundle-workspace-deps.ts';
import { prepareJsrPublishDirectory } from './prepare-jsr-publish.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('getBundleDependencyNames reads npm native bundleDependencies', () => {
	assert.deepEqual(
		getBundleDependencyNames({
			name: '@ecopages/mdx',
			bundleDependencies: ['@ecopages/mdx-core'],
		}),
		['@ecopages/mdx-core'],
	);
});

test('createDistManifest preserves bundleDependencies and bundled dependency versions', () => {
	const distManifest = createDistManifest(
		{
			name: '@ecopages/mdx',
			bundleDependencies: ['@ecopages/mdx-core'],
			dependencies: {
				'@ecopages/logger': '^0.2.3',
				'@ecopages/mdx-core': 'workspace:*',
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

	assert.deepEqual(distManifest.bundleDependencies, ['@ecopages/mdx-core']);
	assert.deepEqual(distManifest.dependencies, {
		'@ecopages/logger': '^0.2.3',
		'@ecopages/mdx-core': '9.9.9',
	});
});

test('copyBundledDependenciesToDist rejects transitive bundleDependencies', () => {
	const tempRoot = mkdtempSync(path.join(tmpdir(), 'ecopages-bundle-test-'));
	const bundledPackageDir = path.join(tempRoot, 'bundled');
	const bundledDistDir = path.join(bundledPackageDir, 'dist');
	mkdirSync(bundledDistDir, { recursive: true });
	writeFileSync(
		path.join(bundledDistDir, 'package.json'),
		`${JSON.stringify({
			name: '@ecopages/nested-bundled',
			bundleDependencies: ['@ecopages/other'],
		})}\n`,
	);

	try {
		assert.throws(
			() =>
				copyBundledDependenciesToDist(
					{
						name: '@ecopages/consumer',
						bundleDependencies: ['@ecopages/nested-bundled'],
					},
					path.join(tempRoot, 'consumer-dist'),
					new Map([['@ecopages/nested-bundled', bundledPackageDir]]),
				),
			/transitive bundling is not supported/,
		);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test('build:npm keeps bare imports and vendors mdx-core under node_modules', async () => {
	const { spawnSync } = await import('node:child_process');
	const buildResult = spawnSync('node', ['scripts/build-npm-packages.ts', '@ecopages/mdx'], {
		cwd: repoRoot,
		encoding: 'utf-8',
	});

	assert.equal(buildResult.status, 0, buildResult.stderr || buildResult.stdout);

	const distDir = path.join(repoRoot, 'packages/integrations/mdx/dist');
	const loaderSource = readFileSync(path.join(distDir, 'src/mdx-loader-plugin.js'), 'utf-8');

	// npm bundleDependencies ships the dep in dist/node_modules/, so Node resolves bare
	// specifiers at install time — imports must stay as "@ecopages/mdx-core", not rewritten.
	assert.match(loaderSource, /from "@ecopages\/mdx-core"/);
	assert.equal(existsSync(path.join(distDir, 'node_modules/@ecopages/mdx-core/package.json')), true);

	const distManifest = JSON.parse(readFileSync(path.join(distDir, 'package.json'), 'utf-8')) as {
		bundleDependencies?: string[];
		dependencies?: Record<string, string>;
	};
	assert.deepEqual(distManifest.bundleDependencies, ['@ecopages/mdx-core']);
	const rootVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')).version as string;
	assert.equal(distManifest.dependencies?.['@ecopages/mdx-core'], rootVersion);
}, 30_000);

test('prepareJsrPublishDirectory mirrors bundled deps into node_modules without rewriting imports', () => {
	const packageDir = path.join(repoRoot, 'packages/integrations/mdx');
	const publishDir = prepareJsrPublishDirectory(packageDir, '9.9.9');

	try {
		const loaderSource = readFileSync(path.join(publishDir, 'src/mdx-loader-plugin.ts'), 'utf-8');
		assert.match(loaderSource, /from '@ecopages\/mdx-core'/);
		assert.equal(existsSync(path.join(publishDir, 'node_modules/@ecopages/mdx-core/src/index.ts')), true);

		const jsrConfig = JSON.parse(readFileSync(path.join(publishDir, 'jsr.json'), 'utf-8')) as {
			publish?: { include?: string[] };
		};
		assert.equal(jsrConfig.publish?.include?.includes('node_modules/@ecopages/mdx-core/**/*.ts'), true);
	} finally {
		rmSync(publishDir, { recursive: true, force: true });
	}
});
