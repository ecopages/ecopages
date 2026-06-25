import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const createdWorkers: Array<
	EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }
> = [];

vi.mock('node:worker_threads', () => ({
	Worker: class extends EventEmitter {
		postMessage = vi.fn();
		terminate = vi.fn(async () => {});

		constructor() {
			super();
			createdWorkers.push(this);
		}
	},
}));

const { LitStaticRenderWorkerClient } = await import('../lit-static-render-worker-client.ts');

describe('LitStaticRenderWorkerClient', () => {
	it('terminates the worker on dispose', async () => {
		createdWorkers.length = 0;
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
});
