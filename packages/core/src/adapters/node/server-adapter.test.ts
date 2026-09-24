import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { NodeServerAdapterParams } from './server-adapter.ts';
import { NodeServerAdapter } from './server-adapter.ts';
import { DefaultNodeServerDevRuntimeFactory } from './server-adapter-dependencies.ts';
import { NodeClientAbortError } from './http-request-bridge.ts';
import { NodeStaticPreviewHost } from './static-preview-host.ts';
import type { NodeServerDevRuntimeFactory } from './server-adapter-dependencies.ts';

const upgrades = vi.hoisted(() => ({ attach: vi.fn() }));

vi.mock('../shared/ws/node-http-websocket-upgrades.ts', () => ({
	attachNodeHttpWebSocketUpgrades: upgrades.attach,
}));

class TestNodeServerAdapter extends NodeServerAdapter {
	public handleSharedRequestImpl?: () => Promise<Response>;

	public setInitializedForTest(): void {
		(this as unknown as { initialized: boolean }).initialized = true;
	}

	public setHmrManagerForTest(hmrManager: { isEnabled: () => boolean } | null): void {
		(this as unknown as { hmrManager: { isEnabled: () => boolean } | null }).hmrManager = hmrManager;
	}

	public override async handleSharedRequest(): Promise<Response> {
		if (this.handleSharedRequestImpl) {
			return await this.handleSharedRequestImpl();
		}

		return new Response('<html><body><h1>Explicit route</h1></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
	}
}

function createAdapter(options?: Partial<NodeServerAdapterParams>) {
	const appConfig = {
		rootDir: '/tmp/app',
		distDir: '.ecopages',
		runtime: {},
	} as unknown as EcoPagesAppConfig;

	return new TestNodeServerAdapter({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
		serveOptions: {},
		options: { watch: true },
		previewHost: new NodeStaticPreviewHost(),
		devRuntimeFactory: new DefaultNodeServerDevRuntimeFactory(),
		...options,
	});
}

describe('NodeServerAdapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('does not re-inject HMR at the Node boundary (inject lives in SharedServerAdapter)', async () => {
		const adapter = createAdapter();
		adapter.setInitializedForTest();
		adapter.setHmrManagerForTest({ isEnabled: () => true });

		const response = await adapter.handleRequest(new Request('http://localhost:3000/explicit/team'));
		const html = await response.text();

		expect(html).toBe('<html><body><h1>Explicit route</h1></body></html>');
		expect(html).not.toContain("import '/_hmr_runtime.js'");
	});

	it('does not inject the HMR runtime when watch mode is disabled', async () => {
		const adapter = createAdapter({ options: { watch: false } });
		adapter.setInitializedForTest();
		adapter.setHmrManagerForTest({ isEnabled: () => true });

		const response = await adapter.handleRequest(new Request('http://localhost:3000/explicit/team'));
		const html = await response.text();

		expect(html).not.toContain("import '/_hmr_runtime.js'");
	});

	it('does not inject the HMR runtime when the host owns dev-client bootstrap', async () => {
		const adapter = createAdapter({ hostOwnsDevClient: true });
		adapter.setInitializedForTest();
		adapter.setHmrManagerForTest({ isEnabled: () => true });

		const response = await adapter.handleRequest(new Request('http://localhost:3000/explicit/team'));
		const html = await response.text();

		expect(html).not.toContain("import '/_hmr_runtime.js'");
	});

	it('returns 499 for normalized client aborts', async () => {
		const adapter = createAdapter({ options: { watch: false } });
		adapter.setInitializedForTest();
		adapter.handleSharedRequestImpl = async () => {
			throw new NodeClientAbortError();
		};

		const response = await adapter.handleRequest(new Request('http://localhost:3000/upload'));

		expect(response.status).toBe(499);
	});

	it('routes errors that escape the request pipeline through app.onError', async () => {
		const errorHandler = vi.fn(async () => new Response('handled', { status: 418 }));
		const adapter = createAdapter({ options: { watch: false }, errorHandler });
		adapter.setInitializedForTest();
		adapter.handleSharedRequestImpl = async () => {
			throw new Error('boom');
		};

		const response = await adapter.handleRequest(new Request('http://localhost:3000/page'));

		expect(response.status).toBe(418);
		expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.anything());
	});

	it('answers escaped errors with 500 when no onError handler is registered', async () => {
		const adapter = createAdapter({ options: { watch: false } });
		adapter.setInitializedForTest();
		adapter.handleSharedRequestImpl = async () => {
			throw new Error('boom');
		};

		const response = await adapter.handleRequest(new Request('http://localhost:3000/page'));

		expect(response.status).toBe(500);
	});

	it('builds static pages without an ephemeral build server', async () => {
		const staticBuilderBuild = vi.fn().mockResolvedValue(undefined);
		const adapter = createAdapter({ options: { watch: false } });
		adapter.setInitializedForTest();
		(adapter as unknown as { staticBuilder: { build: typeof staticBuilderBuild } }).staticBuilder = {
			build: staticBuilderBuild,
		};

		await adapter.buildStatic({ force: true });

		expect(staticBuilderBuild).toHaveBeenCalledWith(
			expect.objectContaining({ baseUrl: 'http://localhost:3000' }),
			expect.any(Object),
		);
	});

	describe('completeInitialization upgrade wiring', () => {
		const server = {} as import('node:http').Server;

		beforeEach(() => {
			upgrades.attach.mockReset();
		});

		it('forwards passthroughUnmatched when serving without watch', async () => {
			const adapter = createAdapter({ options: { watch: false } });

			await adapter.completeInitialization(server, { passthroughUnmatched: true });

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({ passthroughUnmatched: true }),
			);
			expect(upgrades.attach.mock.calls[0][1]).not.toHaveProperty('preflight');
		});

		it('forwards passthroughUnmatched alongside the HMR preflight in watch mode', async () => {
			const devRuntimeFactory: NodeServerDevRuntimeFactory = {
				create: () =>
					({
						websocketServer: {},
						bridge: {},
						hmrManager: { setEnabled: vi.fn(), ensureRuntimeReady: vi.fn(async () => {}) },
					}) as unknown as ReturnType<NodeServerDevRuntimeFactory['create']>,
			};
			const wiringDone = new Error('stop after upgrade wiring');
			upgrades.attach.mockImplementationOnce(() => {
				throw wiringDone;
			});
			const adapter = createAdapter({ options: { watch: true }, devRuntimeFactory });

			await expect(adapter.completeInitialization(server, { passthroughUnmatched: true })).rejects.toBe(
				wiringDone,
			);

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({ passthroughUnmatched: true, preflight: expect.any(Function) }),
			);
		});
	});
});
