import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { BuildExecutor, BuildOptions, BuildResult } from './build-adapter.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';

function createDelayedExecutor(delayMs: number): BuildExecutor {
	return {
		async build(options: BuildOptions): Promise<BuildResult> {
			await new Promise((resolve) => setTimeout(resolve, delayMs));

			const entrypointPaths = Array.isArray(options.entrypoints)
				? options.entrypoints
				: Object.values(options.entrypoints);

			return {
				success: true,
				logs: [],
				outputs: entrypointPaths.map((entrypoint) => ({
					path: `${entrypoint}.js`,
					contents: '',
				})),
			};
		},
	};
}

test('ParallelBuildExecutor returns the inner executor via unwrap', () => {
	const inner = createDelayedExecutor(0);
	const parallel = new ParallelBuildExecutor(inner, 2);
	assert.equal(parallel.unwrap(), inner);
});

test('ParallelBuildExecutor runs builds concurrently up to the configured limit', async () => {
	const inner = createDelayedExecutor(20);
	const parallel = new ParallelBuildExecutor(inner, 2);
	const buildOptions = {
		entrypoints: ['/in/a.ts'],
		root: '/in',
		outdir: '/out',
		target: 'browser' as const,
		format: 'esm' as const,
		sourcemap: 'none' as const,
	};

	const builds = await Promise.all([
		parallel.build(buildOptions),
		parallel.build(buildOptions),
		parallel.build(buildOptions),
	]);

	assert.equal(builds.length, 3);
	for (const result of builds) {
		assert.equal(result.success, true);
	}
});

test('ParallelBuildExecutor does not exceed the concurrency limit', async () => {
	let activeBuilds = 0;
	let maxActiveBuilds = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			activeBuilds += 1;
			maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds);
			await new Promise((resolve) => setTimeout(resolve, 25));
			activeBuilds -= 1;
			return { success: true, logs: [], outputs: [] };
		},
	};
	const parallel = new ParallelBuildExecutor(inner, 2);
	const buildOptions = {
		entrypoints: ['/in/a.ts'],
		root: '/in',
		outdir: '/out',
		target: 'browser' as const,
		format: 'esm' as const,
		sourcemap: 'none' as const,
	};

	await Promise.all(Array.from({ length: 4 }, () => parallel.build(buildOptions)));
	assert.ok(maxActiveBuilds <= 2, `expected at most 2 concurrent builds, saw ${maxActiveBuilds}`);
});

test('ParallelBuildExecutor releases capacity after a failed build', async () => {
	let callCount = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			callCount += 1;
			if (callCount === 1) {
				throw new Error('synthetic build failure');
			}

			return { success: true, logs: [], outputs: [] };
		},
	};
	const parallel = new ParallelBuildExecutor(inner, 2);
	const buildOptions = {
		entrypoints: ['/in/a.ts'],
		root: '/in',
		outdir: '/out',
		target: 'browser' as const,
		format: 'esm' as const,
		sourcemap: 'none' as const,
	};

	await assert.rejects(() => parallel.build(buildOptions), /synthetic build failure/);
	const followUp = await parallel.build(buildOptions);
	assert.equal(followUp.success, true);
});

test('ParallelBuildExecutor overlaps queued builds up to the concurrency limit', async () => {
	const buildDelayMs = 30;
	const buildCount = 4;
	let activeBuilds = 0;
	let maxActiveBuilds = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			activeBuilds += 1;
			maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds);
			await new Promise((resolve) => setTimeout(resolve, buildDelayMs));
			activeBuilds -= 1;
			return { success: true, logs: [], outputs: [] };
		},
	};
	const parallel = new ParallelBuildExecutor(inner, 2);
	const buildOptions = {
		entrypoints: ['/in/a.ts'],
		root: '/in',
		outdir: '/out',
		target: 'browser' as const,
		format: 'esm' as const,
		sourcemap: 'none' as const,
	};

	await Promise.all(Array.from({ length: buildCount }, () => parallel.build(buildOptions)));

	assert.equal(maxActiveBuilds, 2, 'expected queued builds to overlap two at a time');
});
