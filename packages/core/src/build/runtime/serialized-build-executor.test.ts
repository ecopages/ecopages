import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';
import type { BuildExecutor, BuildOptions, BuildResult } from '../build-adapter.ts';

function createFakeExecutor(): BuildExecutor & { callOrder: number[]; active: number; maxActive: number } {
	const state = { callOrder: [] as number[], active: 0, maxActive: 0 };
	let counter = 0;
	return {
		get callOrder() {
			return state.callOrder;
		},
		get active() {
			return state.active;
		},
		get maxActive() {
			return state.maxActive;
		},
		async build(options: BuildOptions): Promise<BuildResult> {
			const id = ++counter;
			state.callOrder.push(id);
			state.active += 1;
			state.maxActive = Math.max(state.maxActive, state.active);
			try {
				const delay = typeof options.naming === 'string' ? Number.parseInt(options.naming, 10) || 10 : 10;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return { success: true, logs: [], outputs: [{ path: `/out/${id}.js` }] };
			} finally {
				state.active -= 1;
			}
		},
	};
}

test('SerializedBuildExecutor returns the inner executor via unwrap', () => {
	const inner = createFakeExecutor();
	const serialized = new SerializedBuildExecutor(inner);
	assert.equal(serialized.unwrap(), inner);
});

test('SerializedBuildExecutor runs a single build through the inner executor', async () => {
	const inner = createFakeExecutor();
	const serialized = new SerializedBuildExecutor(inner);
	const result = await serialized.build({ entrypoints: ['/in/index.ts'] });
	assert.equal(result.success, true);
	assert.equal(inner.callOrder.length, 1);
});

test('SerializedBuildExecutor runs concurrent builds in order, never overlapping', async () => {
	const inner = createFakeExecutor();
	const serialized = new SerializedBuildExecutor(inner);
	const builds = [
		serialized.build({ entrypoints: ['/in/a.ts'], naming: '20' }),
		serialized.build({ entrypoints: ['/in/b.ts'], naming: '10' }),
		serialized.build({ entrypoints: ['/in/c.ts'], naming: '5' }),
	];
	const results = await Promise.all(builds);
	assert.deepEqual(
		results.map((result) => result.outputs[0]?.path),
		['/out/1.js', '/out/2.js', '/out/3.js'],
	);
	assert.equal(inner.callOrder.length, 3);
	assert.equal(inner.maxActive, 1, 'no two inner builds ever ran concurrently');
});

test('SerializedBuildExecutor releases the queue on failure so the next build can run', async () => {
	let shouldFail = true;
	const inner: BuildExecutor = {
		async build(_options) {
			if (shouldFail) {
				shouldFail = false;
				throw new Error('synthetic build failure');
			}
			return { success: true, logs: [], outputs: [{ path: '/out/recovered.js' }] };
		},
	};
	const serialized = new SerializedBuildExecutor(inner);

	await assert.rejects(() => serialized.build({ entrypoints: ['/in/a.ts'] }), /synthetic build failure/);
	const result = await serialized.build({ entrypoints: ['/in/b.ts'] });
	assert.equal(result.success, true);
	assert.equal(result.outputs[0]?.path, '/out/recovered.js');
});

test('SerializedBuildExecutor.resetForTests clears the queue tail', async () => {
	const inner = createFakeExecutor();
	const serialized = new SerializedBuildExecutor(inner);

	const pending = serialized.build({ entrypoints: ['/in/a.ts'] });
	serialized.resetForTests();
	const result = await pending;
	assert.equal(result.success, true);

	const followUp = await serialized.build({ entrypoints: ['/in/b.ts'] });
	assert.equal(followUp.outputs[0]?.path, '/out/2.js');
});
