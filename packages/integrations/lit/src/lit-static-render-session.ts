import type { PageParams, PageQuery } from '@ecopages/core';
import { LitStaticRenderWorkerClient } from './lit-static-render-worker-client.ts';
import type { LitStaticRenderResult } from './lit-static-render-protocol.ts';

type LitStaticRenderWorkerClientContract = Pick<LitStaticRenderWorkerClient, 'start' | 'renderPage' | 'dispose'>;

type LitStaticRenderWorkerIdentity = {
	configModulePath: string;
	runtimeOrigin: string;
	directories: { distDir: string; workDir: string };
};

type LitStaticRenderSessionOptions = {
	getInvalidationVersion?: () => number;
	createWorkerClient?: (input: LitStaticRenderWorkerIdentity) => LitStaticRenderWorkerClientContract;
};

/**
 * Plugin-runtime-scoped Lit server render session.
 *
 * @remarks
 * Owns the worker lifecycle for Lit page routes during static export. `ssr: true`
 * preloads for in-process renders stay with the renderer's preloader, which
 * compiles through the server module loader instead of the browser asset pipeline.
 * Injected into `LitRenderer` via a lazy accessor from `LitPlugin`; there is no
 * process-global coordinator. Serving leaves the session unset.
 *
 * Worker init identity is sticky for the first `{ configModulePath, runtimeOrigin, directories }`.
 * Later `ensureWorker` calls with the same identity are no-ops; a different identity
 * recreates the worker so stale config/origin is never silently reused.
 */
export class LitStaticRenderSession {
	private readonly createWorkerClient: NonNullable<LitStaticRenderSessionOptions['createWorkerClient']>;
	private workerClient: LitStaticRenderWorkerClientContract | null = null;
	private workerIdentity: LitStaticRenderWorkerIdentity | null = null;
	private readonly getInvalidationVersion: () => number;
	private workerInvalidationVersion = 0;
	private renderChain: Promise<void> = Promise.resolve();

	constructor(options: LitStaticRenderSessionOptions = {}) {
		this.getInvalidationVersion = options.getInvalidationVersion ?? (() => 0);
		this.createWorkerClient = options.createWorkerClient ?? ((input) => new LitStaticRenderWorkerClient(input));
	}

	/**
	 * Ensures the static render worker is running for the given identity.
	 *
	 * @remarks
	 * First successful start sticks that identity. Matching re-entry is a no-op.
	 * A different `configModulePath`, `runtimeOrigin` or `directories` disposes and recreates.
	 */
	async ensureWorker(input: LitStaticRenderWorkerIdentity): Promise<void> {
		if (
			this.workerClient &&
			this.workerIdentity &&
			this.workerIdentity.configModulePath === input.configModulePath &&
			this.workerIdentity.runtimeOrigin === input.runtimeOrigin &&
			this.workerIdentity.directories.distDir === input.directories.distDir &&
			this.workerIdentity.directories.workDir === input.directories.workDir
		) {
			return;
		}

		if (this.workerClient) {
			await this.dispose();
		}

		this.workerIdentity = { ...input };
		this.workerClient = this.createWorkerClient(this.workerIdentity);
		await this.workerClient.start();
		this.workerInvalidationVersion = this.getInvalidationVersion();
	}

	async renderPageInWorker(input: {
		filePath: string;
		params: PageParams;
		query?: PageQuery;
	}): Promise<LitStaticRenderResult> {
		if (!this.workerClient) {
			throw new Error('Lit static render worker is not active');
		}

		const render = this.renderChain.then(async () => {
			const version = this.getInvalidationVersion();
			if (version !== this.workerInvalidationVersion && this.workerIdentity) {
				const identity = this.workerIdentity;
				await this.dispose();
				await this.ensureWorker(identity);
			}
			if (!this.workerClient) throw new Error('Lit static render worker is not active');
			return this.workerClient.renderPage(input);
		});
		this.renderChain = render.then(
			() => undefined,
			() => undefined,
		);
		return render;
	}

	async dispose(): Promise<void> {
		await this.workerClient?.dispose();
		this.workerClient = null;
		this.workerIdentity = null;
	}
}
