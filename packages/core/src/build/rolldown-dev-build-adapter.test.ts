import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, test } from 'vitest';
import { RolldownDevBuildAdapter } from './rolldown-dev-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-dev-adapter-test-'));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeFixture(filename: string, source: string): string {
	const fullPath = path.join(workDir, filename);
	writeFileSync(fullPath, source);
	return fullPath;
}

describe('RolldownDevBuildAdapter', () => {
	test('builds a single entrypoint and reports outputs', async () => {
		const entrypoint = writeFixture('index.ts', 'export const answer = 42;\n');
		const adapter = new RolldownDevBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		try {
			const result = await adapter.build({
				entrypoints: [entrypoint],
				outdir,
				target: 'browser',
				format: 'esm',
				root: workDir,
			});

			assert.equal(result.success, true);
			assert.ok(result.outputs.length > 0, 'at least one output file');
			const firstOutput = result.outputs[0]!;
			assert.ok(firstOutput.path.startsWith(outdir), 'output path is under outdir');
			assert.ok(firstOutput.path.endsWith('.js'), `browser output has .js extension, got: ${firstOutput.path}`);
			assert.ok(
				readFileSync(firstOutput.path, 'utf-8').includes('answer'),
				'bundled output contains exported symbol',
			);
		} finally {
			await adapter.close();
		}
	});

	test('reuses the same DevEngine across builds with identical config', { timeout: 15000 }, async () => {
		const entrypoint = writeFixture('index.ts', 'export const x = 1;\n');
		const adapter = new RolldownDevBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const buildOptions = {
			entrypoints: [entrypoint],
			outdir,
			target: 'browser' as const,
			format: 'esm' as const,
			root: workDir,
		};

		try {
			const result1 = await adapter.build(buildOptions);
			assert.equal(result1.success, true);
			assert.equal(adapter.getEngineInstanceCountForTests(), 1, 'one engine created on first build');

			const result2 = await adapter.build(buildOptions);
			assert.equal(result2.success, true);
			assert.equal(adapter.getEngineInstanceCountForTests(), 1, 'engine reused on second build');
		} finally {
			await adapter.close();
		}
	});

	test('creates a new DevEngine when the plugin set changes', { timeout: 20000 }, async () => {
		const entrypoint = writeFixture('index.ts', 'export const x = 1;\n');
		const adapter = new RolldownDevBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		try {
			await adapter.build({
				entrypoints: [entrypoint],
				outdir,
				target: 'browser',
				format: 'esm',
				root: workDir,
				plugins: [{ name: 'plugin-a', setup: () => {} }],
			});
			assert.equal(adapter.getEngineInstanceCountForTests(), 1);

			await adapter.build({
				entrypoints: [entrypoint],
				outdir,
				target: 'browser',
				format: 'esm',
				root: workDir,
				plugins: [{ name: 'plugin-b', setup: () => {} }],
			});
			assert.equal(adapter.getEngineInstanceCountForTests(), 2, 'plugin-set change created a new engine');
		} finally {
			await adapter.close();
		}
	});

	test('resolve returns a string for a valid module', () => {
		const adapter = new RolldownDevBuildAdapter();
		const resolved = adapter.resolve('node:fs', workDir);
		assert.equal(typeof resolved, 'string', 'resolve returns a string');
	});

	test('getTranspileOptions returns browser options for hmr-entrypoint', () => {
		const adapter = new RolldownDevBuildAdapter();
		const options = adapter.getTranspileOptions('hmr-entrypoint');
		assert.equal(options.target, 'browser');
		assert.equal(options.format, 'esm');
	});
});
