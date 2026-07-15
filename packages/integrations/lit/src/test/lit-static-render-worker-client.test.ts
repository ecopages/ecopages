import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const createdWorkers: Array<
	EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }
> = [];

const workerThreadsMock = () => ({
	Worker: class extends EventEmitter {
		postMessage = vi.fn();
		terminate = vi.fn(async () => undefined);

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
	it('terminates the worker on dispose', async () => {
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

		await client.dispose();

		expect(createdWorker.terminate).toHaveBeenCalledTimes(1);
	});

	it('round-trips query and cache strategy', async () => {
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
		});

		await expect(renderPromise).resolves.toEqual({
			html: '<html>Lit worker</html>',
			cacheStrategy: { revalidate: 60 },
		});
		await client.dispose();
	});
});
