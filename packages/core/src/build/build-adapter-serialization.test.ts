import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
import { createAppBuildExecutor, createOrReuseAppBuildExecutor, DevBuildCoordinator } from './dev-build-coordinator.ts';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';

function createBuildResult(entryPoint: string) {
	const label = path.basename(entryPoint).replace(/\.[^.]+$/u, '');
	return {
		success: true,
		logs: [],
		outputs: [{ path: `/tmp/out/${label}.js` }],
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

test('DevBuildCoordinator serializes concurrent build calls from overlapping callers', async () => {
	let activeBuilds = 0;
	let maxActiveBuilds = 0;
	const order: string[] = [];
	const adapter = new EsbuildBuildAdapter();
	vi.spyOn(adapter, 'buildOrThrow').mockImplementation(async (options) => {
		const entryPoint = options.entrypoints[0] ?? 'unknown';
		const label = path.basename(entryPoint);

		activeBuilds += 1;
		maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds);
		order.push(`start:${label}`);

		await new Promise((resolve) => setTimeout(resolve, 25));

		order.push(`end:${label}`);
		activeBuilds -= 1;

		return createBuildResult(entryPoint);
	});
	const coordinator = new DevBuildCoordinator(adapter);

	const [firstBuild, secondBuild] = await Promise.all([
		coordinator.build({
			entrypoints: ['/tmp/first.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
		coordinator.build({
			entrypoints: ['/tmp/second.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
	]);

	assert.equal(firstBuild.success, true);
	assert.equal(secondBuild.success, true);
	assert.equal(maxActiveBuilds, 1);
	assert.deepEqual(order, ['start:first.ts', 'end:first.ts', 'start:second.ts', 'end:second.ts']);
});

test('DevBuildCoordinator resets and retries after an esbuild protocol failure', async () => {
	const adapter = new EsbuildBuildAdapter();
	const buildOrThrow = vi
		.spyOn(adapter, 'buildOrThrow')
		.mockRejectedValueOnce(new Error('Unexpected end of JSON input'))
		.mockResolvedValueOnce(createBuildResult('/tmp/recovered.ts'));
	const stopEsbuildService = vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);
	const coordinator = new DevBuildCoordinator(adapter);

	const result = await coordinator.build({
		entrypoints: ['/tmp/recovered.ts'],
		root: '/tmp',
		outdir: '/tmp/out',
		target: 'node',
		format: 'esm',
		sourcemap: 'none',
		splitting: false,
		minify: false,
	});

	assert.equal(result.success, true);
	assert.equal(buildOrThrow.mock.calls.length, 2);
	assert.equal(stopEsbuildService.mock.calls.length, 1);
	assert.deepEqual(result.outputs, [{ path: '/tmp/out/recovered.js' }]);
});

test('DevBuildCoordinator recycles the esbuild service before the next serialized development build', async () => {
	const adapter = new EsbuildBuildAdapter();
	const buildOrThrow = vi
		.spyOn(adapter, 'buildOrThrow')
		.mockImplementation(async (options) => createBuildResult(options.entrypoints[0] ?? 'unknown'));
	const stopEsbuildService = vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);

	const previousNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'development';

	try {
		const coordinator = new DevBuildCoordinator(adapter);

		const firstBuild = await coordinator.build({
			entrypoints: ['/tmp/first.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		const secondBuild = await coordinator.build({
			entrypoints: ['/tmp/second.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(firstBuild.success, true);
		assert.equal(secondBuild.success, true);
		assert.equal(buildOrThrow.mock.calls.length, 2);
		assert.equal(stopEsbuildService.mock.calls.length, 1);
	} finally {
		process.env.NODE_ENV = previousNodeEnv;
	}
});

test('DevBuildCoordinator does not recycle the esbuild service between serialized browser builds', async () => {
	const adapter = new EsbuildBuildAdapter();
	const buildOrThrow = vi
		.spyOn(adapter, 'buildOrThrow')
		.mockImplementation(async (options) => createBuildResult(options.entrypoints[0] ?? 'unknown'));
	const stopEsbuildService = vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);

	const previousNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'development';

	try {
		const coordinator = new DevBuildCoordinator(adapter);

		await coordinator.build({
			entrypoints: ['/tmp/first.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		await coordinator.build({
			entrypoints: ['/tmp/second.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		});

		assert.equal(buildOrThrow.mock.calls.length, 2);
		assert.equal(stopEsbuildService.mock.calls.length, 0);
	} finally {
		process.env.NODE_ENV = previousNodeEnv;
	}
});

test('DevBuildCoordinator can recover from a raw esbuild protocol fault', async () => {
	const adapter = new EsbuildBuildAdapter();
	const stopEsbuildService = vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);
	const coordinator = new DevBuildCoordinator(adapter);

	const handled = await coordinator.recoverFromProtocolFault(new Error('Unexpected end of JSON input'));

	assert.equal(handled, true);
	assert.equal(stopEsbuildService.mock.calls.length, 1);
});

test('DevBuildCoordinator ignores non-esbuild runtime faults', async () => {
	const adapter = new EsbuildBuildAdapter();
	const stopEsbuildService = vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);
	const coordinator = new DevBuildCoordinator(adapter);

	const handled = await coordinator.recoverFromProtocolFault(new Error('Something else failed'));

	assert.equal(handled, false);
	assert.equal(stopEsbuildService.mock.calls.length, 0);
});

test('DevBuildCoordinator recovery clears a wedged serialized build queue', async () => {
	const adapter = new EsbuildBuildAdapter();
	vi.spyOn(adapter, 'stopEsbuildService').mockResolvedValue(undefined);
	const coordinator = new DevBuildCoordinator(adapter);
	coordinator.setBuildQueueForTests(new Promise<void>(() => undefined));

	const handled = await coordinator.recoverFromProtocolFault(new Error('Unexpected end of JSON input'));

	assert.equal(handled, true);
	await assert.doesNotReject(async () => {
		await coordinator.getBuildQueueForTests();
	});
});

test('createOrReuseAppBuildExecutor preserves serialization when rewrapping a dev executor', async () => {
	let activeBuilds = 0;
	let maxActiveBuilds = 0;
	const adapter = new EsbuildBuildAdapter();
	vi.spyOn(adapter, 'buildOrThrow').mockImplementation(async (options) => {
		activeBuilds += 1;
		maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds);

		await new Promise((resolve) => setTimeout(resolve, 25));

		activeBuilds -= 1;
		return createBuildResult(options.entrypoints[0] ?? 'unknown');
	});

	const bootstrapExecutor = createAppBuildExecutor({
		development: true,
		adapter,
	});
	const runtimeExecutor = createOrReuseAppBuildExecutor({
		development: true,
		adapter,
		currentExecutor: bootstrapExecutor,
		getPlugins: () => [],
	});

	await Promise.all([
		bootstrapExecutor.build({
			entrypoints: ['/tmp/bootstrap.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
		runtimeExecutor.build({
			entrypoints: ['/tmp/runtime.ts'],
			root: '/tmp',
			outdir: '/tmp/out',
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
		}),
	]);

	assert.equal(maxActiveBuilds, 1);
});
