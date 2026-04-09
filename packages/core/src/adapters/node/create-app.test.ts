import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { NodeServerAdapterParams, NodeServerAdapterResult } from './server-adapter.ts';
import { NodeEcopagesApp } from './create-app.ts';

class TestNodeEcopagesApp extends NodeEcopagesApp {
	public capturedParams: NodeServerAdapterParams | undefined;

	protected override async createServerAdapter(params: NodeServerAdapterParams): Promise<NodeServerAdapterResult> {
		this.capturedParams = params;
		return {
			getServerOptions: () => params.serveOptions,
			completeInitialization: async () => {},
			handleRequest: async () => new Response(null, { status: 204 }),
			buildStatic: async () => {},
		};
	}

	public async initializeForTest(): Promise<void> {
		await this.initializeServerAdapter();
	}
}

afterEach(() => {
	process.env.NODE_ENV = undefined;
	process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME = undefined;
	process.env.ECOPAGES_PORT = '';
	process.env.ECOPAGES_HOSTNAME = '';
	vi.restoreAllMocks();
});

describe('node embedded app bootstrap', () => {
	it('keeps watch mode enabled for embedded development runtimes', async () => {
		process.env.NODE_ENV = 'development';

		const app = new TestNodeEcopagesApp({
			appConfig: {
				runtime: {},
			} as any,
			runtime: {
				embedded: true,
			},
		});

		await app.initializeForTest();

		assert.equal(app.capturedParams?.options?.watch, true);
		assert.deepEqual(app.capturedParams?.serveOptions, {
			port: 3000,
			hostname: 'localhost',
		});
	});
});
