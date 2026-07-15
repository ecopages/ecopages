import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { BuildExecutor, BuildOptions, BuildResult } from '../build-adapter.ts';
import { createBuildRequestIdentity, DedupingBuildExecutor } from './deduping-build-executor.ts';

const buildOptions: BuildOptions = {
	entrypoints: ['/in/a.ts'],
	root: '/in',
	outdir: '/out',
	target: 'browser',
	format: 'esm',
	sourcemap: 'none',
};

test('createBuildRequestIdentity treats entrypoint order as equivalent', () => {
	const keyA = createBuildRequestIdentity({
		...buildOptions,
		entrypoints: ['/in/a.ts', '/in/b.ts'],
	});
	const keyB = createBuildRequestIdentity({
		...buildOptions,
		entrypoints: ['/in/b.ts', '/in/a.ts'],
	});

	assert.equal(keyA, keyB);
});

test('DedupingBuildExecutor coalesces concurrent identical builds', async () => {
	let innerBuildCount = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			innerBuildCount += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return { success: true, logs: [], outputs: [] };
		},
	};
	const deduping = new DedupingBuildExecutor(inner);

	await Promise.all([deduping.build(buildOptions), deduping.build(buildOptions), deduping.build(buildOptions)]);

	assert.equal(innerBuildCount, 1);
	assert.equal(deduping.getInFlightCountForTests(), 0);
});

test('DedupingBuildExecutor does not coalesce different build options', async () => {
	let innerBuildCount = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			innerBuildCount += 1;
			return { success: true, logs: [], outputs: [] };
		},
	};
	const deduping = new DedupingBuildExecutor(inner);

	await Promise.all([deduping.build(buildOptions), deduping.build({ ...buildOptions, outdir: '/other-out' })]);

	assert.equal(innerBuildCount, 2);
});

test('DedupingBuildExecutor releases in-flight entry after failure', async () => {
	let innerBuildCount = 0;
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			innerBuildCount += 1;
			if (innerBuildCount === 1) {
				throw new Error('synthetic build failure');
			}

			return { success: true, logs: [], outputs: [] };
		},
	};
	const deduping = new DedupingBuildExecutor(inner);

	await assert.rejects(() => deduping.build(buildOptions), /synthetic build failure/);
	const followUp = await deduping.build(buildOptions);
	assert.equal(followUp.success, true);
	assert.equal(innerBuildCount, 2);
});

test('DedupingBuildExecutor returns the inner executor via unwrap', () => {
	const inner: BuildExecutor = {
		async build(): Promise<BuildResult> {
			return { success: true, logs: [], outputs: [] };
		},
	};

	assert.equal(new DedupingBuildExecutor(inner).unwrap(), inner);
});
