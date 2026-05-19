import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { NodeServerAdapterParams, NodeServerAdapterResult } from './server-adapter.ts';
import { NodeEcopagesApp } from './create-app.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';

class TestNodeEcopagesApp extends NodeEcopagesApp {
	public capturedParams: NodeServerAdapterParams | undefined;

	constructor(options: ConstructorParameters<typeof NodeEcopagesApp>[0]) {
		super(options, {
			runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
		});
	}

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

	it('preserves the configured hostname in the reported runtime origin', () => {
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const server = {
			address: () => ({ address: '::1', port: 3000, family: 'IPv6' }),
		} as any;

		assert.equal(
			runtimeHost.getOrigin(server, {
				hostname: 'localhost',
				port: 3000,
			}),
			'http://localhost:3000',
		);
	});
});
