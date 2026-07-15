import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import {
	isDeclaredAppPackageImport,
	isWorkspacePackageImport,
	normalizeNodeRuntimeBuildOutputFile,
} from './runtime-build-output-normalizer.ts';

test('isWorkspacePackageImport detects workspace protocol dependencies', () => {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-workspace-'));
	writeFileSync(
		path.join(rootDir, 'package.json'),
		JSON.stringify({
			dependencies: {
				'@ecopages/core': 'workspace:*',
			},
		}),
		'utf-8',
	);

	assert.equal(isWorkspacePackageImport('@ecopages/core', rootDir), true);
	assert.equal(isWorkspacePackageImport('react', rootDir), false);
});

test('isDeclaredAppPackageImport detects app-declared dependencies', () => {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-declared-'));
	writeFileSync(
		path.join(rootDir, 'package.json'),
		JSON.stringify({
			dependencies: {
				react: '^18.0.0',
			},
		}),
		'utf-8',
	);

	assert.equal(isDeclaredAppPackageImport('react', rootDir), true);
	assert.equal(isDeclaredAppPackageImport('left-pad', rootDir), false);
});

test('normalizeNodeRuntimeBuildOutputFile leaves non-js outputs untouched', () => {
	const outdir = mkdtempSync(path.join(tmpdir(), 'eco-normalizer-'));
	const outputPath = path.join(outdir, 'entry.css');
	const original = '.class { color: red; }';
	writeFileSync(outputPath, original, 'utf-8');

	normalizeNodeRuntimeBuildOutputFile(outputPath, outdir);

	assert.equal(readFileSync(outputPath, 'utf-8'), original);
});

test('RolldownBuildAdapter finalizes node outputs without caller post-processing', async () => {
	const adapter = new RolldownBuildAdapter();
	const outdir = mkdtempSync(path.join(tmpdir(), 'eco-adapter-'));
	const entryPath = path.join(outdir, 'entry.ts');
	writeFileSync(entryPath, `export const value = 1;`, 'utf-8');

	const result = await adapter.build({
		entrypoints: [entryPath],
		root: outdir,
		outdir,
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
	});

	assert.equal(result.success, true);
	assert.ok(result.outputs.length > 0);
	const outputPath = result.outputs[0]!.path;
	const code = readFileSync(outputPath, 'utf-8');
	assert.doesNotMatch(code, /@oxc-project\/runtime/);
});
