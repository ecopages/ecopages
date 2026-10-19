import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { PageParams, PageQuery } from '@ecopages/core';
import { fromLitStaticRenderErrorMessage } from './lit-static-render-error.ts';
import type {
	LitStaticRenderResult,
	LitStaticRenderWorkerRequestMessage,
	LitStaticRenderWorkerResponseMessage,
} from './lit-static-render-protocol.ts';

type PendingRender = {
	resolve: (result: LitStaticRenderResult) => void;
	reject: (error: Error) => void;
};

const workerShutdownTimeoutMs = 30_000;
const workerExitTimeoutMs = 1_000;

export class LitStaticRenderWorkerClient {
	private readonly configModulePath: string;
	private readonly runtimeOrigin: string;
	private worker: Worker | null = null;
	private workerExitPromise: Promise<number> | null = null;
	private workerExitCode: number | null = null;
	private readyPromise: Promise<void> | null = null;
	private pending = new Map<string, PendingRender>();
	private nextRenderId = 0;
	private shutdownHandler: { resolve: () => void; reject: (error: Error) => void } | null = null;

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
			this.workerExitCode = null;
			this.workerExitPromise = new Promise<number>((resolveExit) => {
				worker.once('exit', resolveExit);
			});

			worker.on('message', (message: LitStaticRenderWorkerResponseMessage) => {
				if (message.type === 'ready') {
					resolveReady();
					return;
				}

				if (message.type === 'shutdown-complete') {
					this.shutdownHandler?.resolve();
					this.shutdownHandler = null;
					return;
				}

				if (message.type === 'error') {
					if (message.id && this.pending.has(message.id)) {
						const pending = this.pending.get(message.id)!;
						this.pending.delete(message.id);
						pending.reject(fromLitStaticRenderErrorMessage(message));
						return;
					}

					const error = new Error(message.message);
					this.shutdownHandler?.reject(error);
					this.shutdownHandler = null;
					rejectReady(error);
					return;
				}

				if (message.type === 'result') {
					const pending = this.pending.get(message.id);
					if (!pending) {
						return;
					}

					this.pending.delete(message.id);
					pending.resolve({
						html: message.html,
						cacheStrategy: message.cacheStrategy,
						sourceDependencyPaths: message.sourceDependencyPaths,
						metadata: message.metadata,
					});
				}
			});

			worker.on('error', (error) => {
				rejectReady(error instanceof Error ? error : new Error(String(error)));
			});

			worker.on('exit', (code) => {
				this.workerExitCode = code;
				const exitError = new Error(
					code === 0
						? 'Lit static render worker exited'
						: `Lit static render worker exited with code ${code}`,
				);
				this.rejectPending(exitError);
				this.shutdownHandler?.reject(exitError);
				this.shutdownHandler = null;
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
		params: PageParams;
		query?: PageQuery;
	}): Promise<LitStaticRenderResult> {
		await this.start();

		const worker = this.worker;
		if (!worker) {
			throw new Error('Lit static render worker is not available');
		}

		const id = String(++this.nextRenderId);

		return new Promise<LitStaticRenderResult>((resolve, reject) => {
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
		const workerExit = this.workerExitPromise ?? Promise.resolve(this.workerExitCode ?? 0);
		this.worker = null;
		this.workerExitPromise = null;
		this.readyPromise = null;
		if (this.workerExitCode !== null) {
			if (this.workerExitCode !== 0) {
				throw new Error(`Lit static render worker exited with code ${this.workerExitCode}`);
			}
			return;
		}
		let shutdownTimeout: ReturnType<typeof setTimeout> | undefined;
		const shutdownComplete = new Promise<void>((resolve, reject) => {
			shutdownTimeout = setTimeout(
				() => reject(new Error('Lit static render worker shutdown timed out')),
				workerShutdownTimeoutMs,
			);
			this.shutdownHandler = {
				resolve: () => {
					if (shutdownTimeout) clearTimeout(shutdownTimeout);
					resolve();
				},
				reject: (error) => {
					if (shutdownTimeout) clearTimeout(shutdownTimeout);
					reject(error);
				},
			};
		});

		worker.postMessage({ type: 'shutdown' } satisfies LitStaticRenderWorkerRequestMessage);
		let shutdownError: Error | undefined;
		try {
			await shutdownComplete;
		} catch (error) {
			shutdownError = error instanceof Error ? error : new Error(String(error));
		}
		if (shutdownTimeout) clearTimeout(shutdownTimeout);

		const exitResult = await new Promise<{ code: number } | { timedOut: true }>((resolve) => {
			const exitTimeout = setTimeout(() => resolve({ timedOut: true }), workerExitTimeoutMs);
			void workerExit.then((code) => {
				clearTimeout(exitTimeout);
				resolve({ code });
			});
		});
		if ('timedOut' in exitResult) {
			await worker.terminate();
		} else if (exitResult.code !== 0) {
			shutdownError ??= new Error(`Lit static render worker exited with code ${exitResult.code}`);
		}
		if (shutdownError) throw shutdownError;
	}
}

export const litStaticRenderWorkerEntryPath = fileURLToPath(new URL('./lit-static-render-worker.ts', import.meta.url));
