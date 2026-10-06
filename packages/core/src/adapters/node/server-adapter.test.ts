import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import type { NodeServerAdapterParams } from './server-adapter.ts';
import { NodeServerAdapter } from './server-adapter.ts';
import { NodeClientAbortError } from './http-request-bridge.ts';
import { NodeStaticPreviewHost } from './static-preview-host.ts';

const upgrades = vi.hoisted(() => ({ attach: vi.fn() }));
const devBridge = vi.hoisted(() => ({ reload: vi.fn() }));

vi.mock('../shared/ws/node-http-websocket-upgrades.ts', () => ({
	attachNodeHttpWebSocketUpgrades: upgrades.attach,
}));

const devRuntime = vi.hoisted(() => ({
	websocketServer: {
		handleUpgrade: (_req: unknown, _socket: unknown, _head: unknown, connected: (ws: unknown) => void) =>
			connected(devRuntime.socket),
	},
	socket: { on: () => undefined, send: () => undefined },
	bridge: { subscribe: (_ws: unknown) => undefined, unsubscribe: (_ws: unknown) => undefined },
	hmrManager: {
		setEnabled: () => undefined,
		ensureRuntimeReady: async () => undefined,
		sendPendingBuildErrors: (_ws: unknown) => undefined,
		isEnabled: () => true,
	},
}));

vi.mock('./server-adapter-dependencies.ts', () => ({
	createNodeServerDevRuntime: () => ({
		...devRuntime,
		bridge: { ...devRuntime.bridge, reload: devBridge.reload },
	}),
}));

class TestNodeServerAdapter extends NodeServerAdapter {
	public handleSharedRequestImpl?: () => Promise<Response>;

	public setInitializedForTest(): void {
		(this as unknown as { initialized: boolean }).initialized = true;
	}

	private skipDevRouteSetup = false;

	/** Skips route handler setup and prewarm, which need real pages, when completing watch-mode initialization. */
	public skipDevRouteSetupForTest(): void {
		this.skipDevRouteSetup = true;
	}

	protected override configureSharedResponseHandlers(options: never): void {
		if (!this.skipDevRouteSetup) {
			super.configureSharedResponseHandlers(options);
		}
	}

	protected override async startDevStaticRoutePrewarmWhenReady(): Promise<void> {
		if (!this.skipDevRouteSetup) {
			await super.startDevStaticRoutePrewarmWhenReady();
		}
	}

	public async processFileChangeForTest(file: string): Promise<void> {
		const watcher = (this as unknown as { projectWatcher: unknown }).projectWatcher as {
			processFileChange: (file: string, event: 'change') => Promise<void>;
		};
		await watcher.processFileChange(file, 'change');
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
			const wiringDone = new Error('stop after upgrade wiring');
			upgrades.attach.mockImplementationOnce(() => {
				throw wiringDone;
			});
			const adapter = createAdapter({ options: { watch: true } });

			await expect(adapter.completeInitialization(server, { passthroughUnmatched: true })).rejects.toBe(
				wiringDone,
			);

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({ passthroughUnmatched: true, preflight: expect.any(Function) }),
			);
		});

		it('sends pending build errors to an HMR socket right after subscribing it', async () => {
			const wiringDone = new Error('stop after upgrade wiring');
			upgrades.attach.mockImplementationOnce(() => {
				throw wiringDone;
			});
			const calls: string[] = [];
			vi.spyOn(devRuntime.bridge, 'subscribe').mockImplementation(() => {
				calls.push('subscribe');
			});
			const sendPendingBuildErrors = vi
				.spyOn(devRuntime.hmrManager, 'sendPendingBuildErrors')
				.mockImplementation(() => {
					calls.push('sendPendingBuildErrors');
				});
			const adapter = createAdapter({ options: { watch: true } });
			await expect(adapter.completeInitialization(server)).rejects.toBe(wiringDone);
			const { preflight } = upgrades.attach.mock.calls[0][1] as {
				preflight: (req: { url: string }, socket: unknown, head: unknown) => boolean;
			};

			expect(preflight({ url: '/_hmr' }, {}, Buffer.alloc(0))).toBe(true);

			expect(calls).toEqual(['subscribe', 'sendPendingBuildErrors']);
			expect(sendPendingBuildErrors).toHaveBeenCalledWith(devRuntime.socket);
		});
	});

	it('reloads the browser for a public-directory edit when the host owns the dev client', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: path.join(os.tmpdir(), 'ecopages-host-reload') });
		appConfig.integrations = [];
		const adapter = createAdapter({ appConfig, hostOwnsDevClient: true });
		adapter.skipDevRouteSetupForTest();
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());
		devBridge.reload.mockClear();

		await adapter.completeInitialization({} as import('node:http').Server);
		await adapter.processFileChangeForTest(path.join(appConfig.absolutePaths.publicDir, 'robots.txt'));

		expect(devBridge.reload).toHaveBeenCalledTimes(1);
	});
});
