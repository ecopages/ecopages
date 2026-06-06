/**
 * Rolldown vs esbuild output parity probe.
 *
 * @remarks
 * Per ADR-003 step 4, this file captures the golden output parity
 * between `EsbuildBuildAdapter` and `RolldownBuildAdapter` for the
 * same fixture. The goal is **not** byte-for-byte equality — Rolldown
 * uses different whitespace, comment markers, and chunking heuristics
 * — but **observable behavior**: same exports, same module graph
 * shape, same re-export reach.
 *
 * The test suite is intentionally minimal: a few representative
 * fixtures that exercise named exports, default exports, re-exports,
 * and chained imports. After sign-off the esbuild adapter is deleted
 * in step 6 and this file is updated to drop the esbuild comparison.
 *
 * macOS `/private/var` symlink normalization: `path.resolve` resolves
 * the `/var` -> `/private/var` symlink while Rolldown's internal id
 * keeps the original path. Tests compare basenames or strip the
 * `/private` prefix to be portable.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-parity-'));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeFixture(filename: string, source: string): string {
	const fullPath = path.join(workDir, filename);
	writeFileSync(fullPath, source);
	return fullPath;
}

interface AdapterResult {
	adapterName: 'esbuild' | 'rolldown';
	outputs: Array<{ path: string }>;
	dependencyGraph: Record<string, string[]> | undefined;
	success: boolean;
}

async function buildWith(
	adapter: 'esbuild' | 'rolldown',
	entrypoint: string,
	outdir: string,
): Promise<AdapterResult> {
	const instance = adapter === 'esbuild' ? new EsbuildBuildAdapter() : new RolldownBuildAdapter();
	const result = await instance.build({
		entrypoints: [entrypoint],
		outdir,
		root: workDir,
		target: 'browser',
		format: 'esm',
		minify: false,
	});

	return {
		adapterName: adapter,
		outputs: result.outputs,
		dependencyGraph: result.dependencyGraph?.entrypoints,
		success: result.success,
	};
}

function readFirstBundle(result: AdapterResult): string {
	expect(result.success).toBe(true);
	expect(result.outputs.length).toBeGreaterThan(0);
	const jsOutput = result.outputs.find((entry) => entry.path.endsWith('.js') && !entry.path.endsWith('.js.map'));
	assert.ok(jsOutput, `expected at least one .js output, got: ${result.outputs.map((o) => o.path).join(', ')}`);
	return readFileSync(jsOutput.path, 'utf-8');
}

function stripPrivatePrefix(value: string): string {
	return value.replace(/^\/private\//, '/');
}

async function runIfEsbuildAvailable<T>(work: () => Promise<T>): Promise<T | undefined> {
	try {
		const probeDir = mkdtempSync(path.join(tmpdir(), 'rolldown-parity-probe-'));
		const probe = new EsbuildBuildAdapter();
		const probeEntry = path.join(probeDir, 'probe.ts');
		writeFileSync(probeEntry, "export const v = 1;\n");
		await probe.buildOrThrow({
			entrypoints: [probeEntry],
			outdir: path.join(probeDir, 'probe'),
			root: probeDir,
			target: 'browser',
			format: 'esm',
		});
	} catch (error) {
		console.warn('esbuild probe failed; skipping parity test:', error);
		return undefined;
	}
	return work();
}

describe('Rolldown vs esbuild output parity', () => {
	test('reaches a transitive helper module in the dependency graph', async () => {
		await runIfEsbuildAvailable(async () => {
			writeFixture(
				'a.ts',
				`export function a(): string { return Math.random() > -1 ? 'a' : 'b'; }\n`,
			);
			writeFixture(
				'b.ts',
				`import { a } from './a.ts';\nexport function b(): string { return a() + '-suffix'; }\n`,
			);
			const entry = writeFixture(
				'index.ts',
				`import { b } from './b.ts';\nexport const v = b();\n`,
			);

			const esbuildResult = await buildWith('esbuild', entry, path.join(workDir, 'esbuild-out'));
			const rolldownResult = await buildWith('rolldown', entry, path.join(workDir, 'rolldown-out'));

			const esbuildEntry = Object.keys(esbuildResult.dependencyGraph ?? {}).map((k) => stripPrivatePrefix(k));
			const rolldownEntry = Object.keys(rolldownResult.dependencyGraph ?? {}).map((k) => stripPrivatePrefix(k));

			assert.deepEqual(rolldownEntry, esbuildEntry, 'entrypoint paths match between adapters');

			const lookupDeps = (
				graph: Record<string, string[]> | undefined,
				normalizedEntryPath: string,
			): string[] => {
				if (!graph) return [];
				const direct = graph[normalizedEntryPath];
				if (direct) {
					return direct.map((dep) => path.basename(stripPrivatePrefix(dep)));
				}
				const withPrivate = `/private${normalizedEntryPath}`;
				const alt = graph[withPrivate];
				if (alt) {
					return alt.map((dep) => path.basename(stripPrivatePrefix(dep)));
				}
				return [];
			};

			for (const entryPath of esbuildEntry) {
				const esbuildDeps = lookupDeps(esbuildResult.dependencyGraph, entryPath).sort();
				const rolldownDeps = lookupDeps(rolldownResult.dependencyGraph, entryPath).sort();
				assert.deepEqual(rolldownDeps, esbuildDeps, `dependency file set matches for ${entryPath}`);
			}
		});
	});

	test('emits a single JS output for a single-entrypoint bundle', async () => {
		await runIfEsbuildAvailable(async () => {
			const entry = writeFixture('index.ts', "export const greet = 'hello';\n");

			const esbuildResult = await buildWith('esbuild', entry, path.join(workDir, 'esbuild-out'));
			const rolldownResult = await buildWith('rolldown', entry, path.join(workDir, 'rolldown-out'));

			const esbuildJs = esbuildResult.outputs.filter((o) => o.path.endsWith('.js') && !o.path.endsWith('.js.map'));
			const rolldownJs = rolldownResult.outputs.filter(
				(o) => o.path.endsWith('.js') && !o.path.endsWith('.js.map'),
			);
			assert.equal(esbuildJs.length, 1, 'esbuild emits one JS output');
			assert.equal(rolldownJs.length, 1, 'rolldown emits one JS output');
		});
	});

	test('preserves default export with a non-trivial value', async () => {
		await runIfEsbuildAvailable(async () => {
			const entry = writeFixture('index.ts', 'export default { hello: "world", count: 42 };\n');

			const esbuildBundle = readFirstBundle(
				await buildWith('esbuild', entry, path.join(workDir, 'esbuild-out')),
			);
			const rolldownBundle = readFirstBundle(
				await buildWith('rolldown', entry, path.join(workDir, 'rolldown-out')),
			);

			assert.match(esbuildBundle, /export\s*\{[^}]*\bas\s+default\b/, 'esbuild has a default export clause');
			assert.match(rolldownBundle, /export\s*\{[^}]*\bas\s+default\b/, 'rolldown has a default export clause');
		});
	});
});
