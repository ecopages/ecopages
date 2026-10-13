import { availableParallelism } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { BuildAdapter, BuildOptions, BuildResult } from '../build-adapter.ts';
import { BuildQueue, buildOrThrow, installBuildQueue, resolveBuildLaneLimits } from './build-queue.ts';
import { createBuildFailure, createBuildSuccess } from '../../__fixtures__/build/build-result.ts';

const baseOptions: BuildOptions = {
	environment: 'server',
	entrypoints: ['/in/a.ts'],
	outdir: '/out',
};

function createControlledAdapter() {
	const started: BuildOptions[] = [];
	const finish: Array<() => void> = [];
	let running = 0;
	let peak = 0;
	const adapter: BuildAdapter = {
		build(options) {
			started.push(options);
			running += 1;
			peak = Math.max(peak, running);
			return new Promise<BuildResult>((resolve) => {
				finish.push(() => {
					running -= 1;
					resolve(createBuildSuccess({ outputs: [{ path: `/out/${started.length}.js` }] }));
				});
			});
		},
		resolve: (specifier) => specifier,
	};
	return {
		adapter,
		started,
		peak: () => peak,
		finishNext: () => finish.shift()?.(),
		flush: () => new Promise<void>((resolve) => setImmediate(resolve)),
	};
}

const entry = (name: string): BuildOptions => ({ ...baseOptions, entrypoints: [`/in/${name}.ts`] });

describe('BuildQueue', () => {
	it('runs identical concurrent requests as one build and returns its result to both callers', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 4, hmr: 1 });

		const first = queue.build(baseOptions);
		const second = queue.build({ ...baseOptions });
		await control.flush();
		control.finishNext();

		expect(control.started).toHaveLength(1);
		expect(await first).toBe(await second);
	});

	it('shares one build between lanes', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 4, hmr: 1 });

		const first = queue.build(baseOptions, 'build');
		const second = queue.build(baseOptions, 'hmr');
		await control.flush();
		control.finishNext();
		await Promise.all([first, second]);

		expect(control.started).toHaveLength(1);
	});

	it('builds requests that differ only in runtimeOutdir separately', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 4, hmr: 1 });

		const first = queue.build({ ...baseOptions, runtimeOutdir: '/run/a' });
		const second = queue.build({ ...baseOptions, runtimeOutdir: '/run/b' });
		await control.flush();
		control.finishNext();
		control.finishNext();
		await Promise.all([first, second]);

		expect(control.started).toHaveLength(2);
	});

	it('never runs more builds at once than the lane allows, and starts the rest in arrival order', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 2, hmr: 1 });

		const results = ['a', 'b', 'c', 'd', 'e'].map((name) => queue.build(entry(name)));
		await control.flush();
		expect(control.started.map((options) => options.entrypoints)).toEqual([['/in/a.ts'], ['/in/b.ts']]);

		for (let finished = 0; finished < 5; finished += 1) {
			control.finishNext();
			await control.flush();
		}
		await Promise.all(results);

		expect(control.peak()).toBe(2);
		expect(control.started.map((options) => options.entrypoints)).toEqual(
			['a', 'b', 'c', 'd', 'e'].map((name) => [`/in/${name}.ts`]),
		);
	});

	it('keeps a busy hmr lane from holding up the build lane', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 1, hmr: 1 });

		void queue.build(entry('hmr-one'), 'hmr');
		void queue.build(entry('hmr-two'), 'hmr');
		void queue.build(entry('page'), 'build');
		await control.flush();

		expect(control.started.map((options) => options.entrypoints)).toEqual([['/in/hmr-one.ts'], ['/in/page.ts']]);
	});

	it('does not keep a build that rejected', async () => {
		let calls = 0;
		const adapter: BuildAdapter = {
			async build() {
				calls += 1;
				if (calls === 1) throw new Error('boom');
				return createBuildSuccess();
			},
			resolve: (specifier) => specifier,
		};
		const queue = new BuildQueue(adapter, { build: 1, hmr: 1 });

		await expect(queue.build(baseOptions)).rejects.toThrow('boom');
		await expect(queue.build(baseOptions)).resolves.toMatchObject({ success: true });
		expect(calls).toBe(2);
	});

	it('builds an identical request again once the first finished', async () => {
		const control = createControlledAdapter();
		const queue = new BuildQueue(control.adapter, { build: 1, hmr: 1 });

		const first = queue.build(baseOptions);
		await control.flush();
		control.finishNext();
		await first;
		const second = queue.build(baseOptions);
		await control.flush();
		control.finishNext();
		await second;

		expect(control.started).toHaveLength(2);
	});

	describe('withRequestScope', () => {
		it('shares a finished build with later identical requests of the same scope only', async () => {
			const control = createControlledAdapter();
			const queue = new BuildQueue(control.adapter, { build: 1, hmr: 1 });

			await queue.withRequestScope(async () => {
				const first = queue.build(baseOptions);
				await control.flush();
				control.finishNext();
				await first;
				await queue.build(baseOptions);
			});
			expect(control.started).toHaveLength(1);

			const other = queue.withRequestScope(() => queue.build(baseOptions));
			await control.flush();
			control.finishNext();
			await other;
			expect(control.started).toHaveLength(2);
		});

		it('joins the scope that is already active', async () => {
			const control = createControlledAdapter();
			const queue = new BuildQueue(control.adapter, { build: 1, hmr: 1 });

			await queue.withRequestScope(async () => {
				const first = queue.build(baseOptions);
				await control.flush();
				control.finishNext();
				await first;
				await queue.withRequestScope(() => queue.build(baseOptions));
			});

			expect(control.started).toHaveLength(1);
		});
	});

	it('gives the hmr lane at most three builds and the build lane all but one core', () => {
		const limits = resolveBuildLaneLimits();

		expect(limits.build).toBe(Math.max(1, availableParallelism() - 1));
		expect(limits.hmr).toBe(Math.min(3, limits.build));
	});
});

describe('buildOrThrow', () => {
	const createAppConfig = (result: BuildResult) => {
		const adapter: BuildAdapter = {
			build: async () => result,
			resolve: (specifier) => specifier,
		};
		return { runtime: { buildAdapter: adapter }, loaders: new Map() } as never;
	};

	it('returns the result of a build that succeeded', async () => {
		const result: BuildResult = createBuildSuccess({ outputs: [{ path: '/out/a.js' }] });

		await expect(buildOrThrow(createAppConfig(result), baseOptions, 'Build failed')).resolves.toEqual(result);
	});

	it('throws the formatted logs of a build that failed, on the app queue', async () => {
		const appConfig = createAppConfig(
			createBuildFailure([{ message: 'no loader', plugin: 'eco-loader', id: '/in/a.ts' }]),
		);
		const queue = installBuildQueue(appConfig);
		const queued = vi.spyOn(queue, 'build');

		await expect(buildOrThrow(appConfig, baseOptions, 'Build failed', 'hmr')).rejects.toThrow(
			'Build failed:\n[eco-loader] /in/a.ts: no loader',
		);
		expect(queued).toHaveBeenCalledWith(baseOptions, 'hmr');
	});
});
