import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const createdWorkers: Array<
	EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }
> = [];

const workerThreadsMock = () => ({
	Worker: class extends EventEmitter {
		postMessage = vi.fn();
		terminate = vi.fn(async () => undefined);
		exitCode: number | null = null;

		constructor() {
			super();
			createdWorkers.push(this);
		}
	},
});

async function loadWorkerClient() {
	vi.resetModules?.();
	const installMock = vi.doMock?.bind(vi) ?? vi.mock.bind(vi);
	installMock('node:worker_threads', workerThreadsMock);
	return import('../lit-static-render-worker-client.ts');
}

describe('LitStaticRenderWorkerClient', () => {
	it('waits for graceful shutdown before disposing the worker', async () => {
		createdWorkers.length = 0;
		const { LitStaticRenderWorkerClient } = await loadWorkerClient();
		const client = new LitStaticRenderWorkerClient({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		const startPromise = client.start();
		const createdWorker = createdWorkers[0]!;
		createdWorker.emit('message', { type: 'ready' });
		await startPromise;

		let disposed = false;
		const disposal = client.dispose().then(() => {
			disposed = true;
		});
		expect(createdWorker.postMessage).toHaveBeenLastCalledWith({ type: 'shutdown' });
		expect(createdWorker.terminate).not.toHaveBeenCalled();
		expect(disposed).toBe(false);
		createdWorker.emit('message', { type: 'shutdown-complete' });
		await Promise.resolve();
		expect(disposed).toBe(false);
		createdWorker.emit('exit', 0);
		await disposal;
		expect(disposed).toBe(true);

		expect(createdWorker.terminate).not.toHaveBeenCalled();
	});

	it('terminates the worker if it does not exit after graceful shutdown', async () => {
		vi.useFakeTimers();
		createdWorkers.length = 0;
		try {
			const { LitStaticRenderWorkerClient } = await loadWorkerClient();
			const client = new LitStaticRenderWorkerClient({
				configModulePath: '/app/eco.config.ts',
				runtimeOrigin: 'http://127.0.0.1:3000',
			});

			const startPromise = client.start();
			const createdWorker = createdWorkers[0]!;
			createdWorker.emit('message', { type: 'ready' });
			await startPromise;

			const disposal = client.dispose();
			createdWorker.emit('message', { type: 'shutdown-complete' });
			await Promise.resolve();
			expect(createdWorker.terminate).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1_000);
			await disposal;

			expect(createdWorker.terminate).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not wait for shutdown when the worker already exited', async () => {
		createdWorkers.length = 0;
		const { LitStaticRenderWorkerClient } = await loadWorkerClient();
		const client = new LitStaticRenderWorkerClient({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		const startPromise = client.start();
		const createdWorker = createdWorkers[0]!;
		createdWorker.emit('message', { type: 'ready' });
		await startPromise;
		createdWorker.emit('exit', 1);

		await expect(client.dispose()).rejects.toThrow('Lit static render worker exited with code 1');
		expect(createdWorker.postMessage).not.toHaveBeenLastCalledWith({ type: 'shutdown' });
		expect(createdWorker.terminate).not.toHaveBeenCalled();
	});

	it('round-trips query, cache strategy, source dependency paths and metadata', async () => {
		createdWorkers.length = 0;
		const { LitStaticRenderWorkerClient } = await loadWorkerClient();
		const client = new LitStaticRenderWorkerClient({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		const renderPromise = client.renderPage({
			filePath: '/app/src/pages/docs.lit.tsx',
			params: { slug: 'intro' },
			query: { preview: '1' },
		});
		const createdWorker = createdWorkers[0]!;
		createdWorker.emit('message', { type: 'ready' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(createdWorker.postMessage).toHaveBeenLastCalledWith({
			type: 'render',
			id: '1',
			filePath: '/app/src/pages/docs.lit.tsx',
			params: { slug: 'intro' },
			query: { preview: '1' },
		});
		createdWorker.emit('message', {
			type: 'result',
			id: '1',
			html: '<html>Lit worker</html>',
			cacheStrategy: { revalidate: 60 },
			sourceDependencyPaths: ['/app/src/pages/docs.lit.tsx'],
			metadata: { title: 'Docs', description: 'Docs page' },
		});

		await expect(renderPromise).resolves.toEqual({
			html: '<html>Lit worker</html>',
			cacheStrategy: { revalidate: 60 },
			sourceDependencyPaths: ['/app/src/pages/docs.lit.tsx'],
			metadata: { title: 'Docs', description: 'Docs page' },
		});
		const disposal = client.dispose();
		createdWorker.emit('message', { type: 'shutdown-complete' });
		createdWorker.emit('exit', 0);
		await disposal;
	});
});
