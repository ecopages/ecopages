import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { PageQuery } from '@ecopages/core';
import type {
	LitStaticRenderCacheStrategy,
	LitStaticRenderWorkerRequestMessage,
	LitStaticRenderWorkerResponseMessage,
} from './lit-static-render-protocol.ts';

type PendingRender = {
	resolve: (result: { html: string; cacheStrategy?: LitStaticRenderCacheStrategy }) => void;
	reject: (error: Error) => void;
};

export class LitStaticRenderWorkerClient {
	private readonly configModulePath: string;
	private readonly runtimeOrigin: string;
	private worker: Worker | null = null;
	private readyPromise: Promise<void> | null = null;
	private pending = new Map<string, PendingRender>();
	private nextRenderId = 0;

	constructor({ configModulePath, runtimeOrigin }: { configModulePath: string; runtimeOrigin: string }) {
		this.configModulePath = configModulePath;
		this.runtimeOrigin = runtimeOrigin;
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}

	async start(): Promise<void> {
		if (this.readyPromise) {
			return this.readyPromise;
		}

		this.readyPromise = new Promise<void>((resolveReady, rejectReady) => {
			const worker = new Worker(new URL('./lit-static-render-worker.ts', import.meta.url), {
				execArgv: [...process.execArgv],
				env: {
					...process.env,
					ECOPAGES_LIT_STATIC_RENDER_WORKER: 'true',
				},
			});
			this.worker = worker;

			worker.on('message', (message: LitStaticRenderWorkerResponseMessage) => {
				if (message.type === 'ready') {
					resolveReady();
					return;
				}

				if (message.type === 'error') {
					if (message.id && this.pending.has(message.id)) {
						const pending = this.pending.get(message.id)!;
						this.pending.delete(message.id);
						pending.reject(new Error(message.message));
						return;
					}

					rejectReady(new Error(message.message));
					return;
				}

				if (message.type === 'result') {
					const pending = this.pending.get(message.id);
					if (!pending) {
						return;
					}

					this.pending.delete(message.id);
					pending.resolve({ html: message.html, cacheStrategy: message.cacheStrategy });
				}
			});

			worker.on('error', (error) => {
				rejectReady(error instanceof Error ? error : new Error(String(error)));
			});

			worker.on('exit', (code) => {
				const exitError = new Error(
					code === 0
						? 'Lit static render worker exited'
						: `Lit static render worker exited with code ${code}`,
				);
				this.rejectPending(exitError);
				if (code !== 0) {
					rejectReady(exitError);
				}
			});

			const initMessage: LitStaticRenderWorkerRequestMessage = {
				type: 'init',
				configModulePath: this.configModulePath,
				runtimeOrigin: this.runtimeOrigin,
			};
			worker.postMessage(initMessage);
		});

		return this.readyPromise;
	}

	async renderPage(input: {
		filePath: string;
		params: Record<string, string>;
		query?: PageQuery;
	}): Promise<{ html: string; cacheStrategy?: LitStaticRenderCacheStrategy }> {
		await this.start();

		const worker = this.worker;
		if (!worker) {
			throw new Error('Lit static render worker is not available');
		}

		const id = String(++this.nextRenderId);

		return new Promise<{ html: string; cacheStrategy?: LitStaticRenderCacheStrategy }>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });

			const renderMessage: LitStaticRenderWorkerRequestMessage = {
				type: 'render',
				id,
				filePath: input.filePath,
				params: input.params,
				query: input.query,
			};
			worker.postMessage(renderMessage);
		});
	}

	async dispose(): Promise<void> {
		if (!this.worker) {
			return;
		}

		this.rejectPending(new Error('Lit static render worker was disposed'));

		const worker = this.worker;
		this.worker = null;
		this.readyPromise = null;

		worker.postMessage({ type: 'shutdown' } satisfies LitStaticRenderWorkerRequestMessage);
		await worker.terminate();
	}
}

export const litStaticRenderWorkerEntryPath = fileURLToPath(new URL('./lit-static-render-worker.ts', import.meta.url));
