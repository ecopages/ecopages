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
import { HtmlPagesPlugin } from '../../html-pages/html-pages.plugin.ts';
import { ServerRouteHandler } from '../shared/runtime/server-route-handler.ts';
import { appLogger } from '../../global/app-logger.ts';
import { Processor, type EcoBuildPlugin } from '../../plugins/processor.ts';

const upgrades = vi.hoisted(() => ({ attach: vi.fn() }));
const devBridge = vi.hoisted(() => ({ reload: vi.fn() }));

class PrewarmPathProcessor extends Processor {
	override plugins?: EcoBuildPlugin[] = [];

	constructor(private readonly collectPaths: () => Promise<readonly string[]>) {
		super({ name: 'prewarm-test-processor' });
	}

	override collectDevPrewarmPaths(): Promise<readonly string[]> {
		return this.collectPaths();
	}

	override async setup(): Promise<void> {}

	override async process(input: unknown): Promise<unknown> {
		return input;
	}
}

vi.mock('../shared/ws/node-http-websocket-upgrades.ts', () => ({
	attachNodeHttpWebSocketUpgrades: upgrades.attach,
}));

const devRuntime = vi.hoisted(() => ({
	websocketServer: {
		handleUpgrade: (_req: unknown, _socket: unknown, _head: unknown, connected: (ws: unknown) => void) =>
			connected(devRuntime.socket),
	},
	socket: { on: () => undefined, send: () => undefined },
	bridge: {
		subscribe: (_ws: unknown) => undefined,
		unsubscribe: (_ws: unknown) => undefined,
		destroy: () => undefined,
	},
	hmrManager: {
		setEnabled: () => undefined,
		ensureRuntimeReady: async () => undefined,
		sendPendingBuildErrors: (_ws: unknown) => undefined,
		isEnabled: () => true,
		stop: () => undefined,
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

	protected override startDevStaticRoutePrewarmWhenReady(): void {
		if (!this.skipDevRouteSetup) {
			super.startDevStaticRoutePrewarmWhenReady();
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

		it('attaches user upgrades without a preflight when serving without watch', async () => {
			const adapter = createAdapter({ options: { watch: false } });

			await adapter.completeInitialization(server);

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({
					runtimeOrigin: expect.any(String),
					websocketHandlers: expect.any(Map),
				}),
			);
			expect(upgrades.attach.mock.calls[0]?.[1]).not.toHaveProperty('preflight');
		});

		it('attaches the HMR preflight in watch mode', async () => {
			const wiringDone = new Error('stop after upgrade wiring');
			upgrades.attach.mockImplementationOnce(() => {
				throw wiringDone;
			});
			const adapter = createAdapter({ options: { watch: true } });

			await expect(adapter.completeInitialization(server)).rejects.toBe(wiringDone);

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({ preflight: expect.any(Function) }),
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

	it('reloads the browser for a public-directory edit', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: path.join(os.tmpdir(), 'ecopages-host-reload') });
		appConfig.integrations = [];
		const adapter = createAdapter({ appConfig });
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

	it('completes initialization while a prewarm render is pending and waits for it before Integration teardown', async () => {
		const shutdownEvents: string[] = [];
		class ResourceIntegration extends HtmlPagesPlugin {
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {
				shutdownEvents.push('teardown');
			}
		}
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: path.join(os.tmpdir(), 'ecopages-pending-prewarm'),
			devPrewarmPaths: ['/slow-page'],
			integrations: [new ResourceIntegration()],
		});
		const adapter = createAdapter({ appConfig, options: { watch: true } });
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());

		let finishPageRender!: () => void;
		const pageRenderPending = new Promise<Response>((resolve) => {
			finishPageRender = () =>
				resolve(
					new Response('<html><body>Slow Page</body></html>', { headers: { 'Content-Type': 'text/html' } }),
				);
		});

		let markRenderStarted!: () => void;
		const renderStartedPromise = new Promise<void>((resolve) => {
			markRenderStarted = resolve;
		});

		vi.spyOn(ServerRouteHandler.prototype, 'handleResponse').mockImplementation(async () => {
			markRenderStarted();
			const response = await pageRenderPending;
			shutdownEvents.push('render finished');
			return response;
		});

		await adapter.completeInitialization({} as import('node:http').Server);
		await renderStartedPromise;

		let disposed = false;
		const disposal = adapter.dispose().then(() => {
			disposed = true;
		});
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(disposed).toBe(false);
		expect(shutdownEvents).toEqual([]);

		finishPageRender();
		await disposal;
		expect(shutdownEvents).toEqual(['render finished', 'teardown']);
	});

	it('completes initialization while Processor prewarm paths are still being collected', async () => {
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: path.join(os.tmpdir(), 'ecopages-pending-prewarm-paths'),
		});
		const pathCollection = new Promise<readonly string[]>(() => {});
		const collectDevPrewarmPaths = vi.fn(() => pathCollection);
		appConfig.processors.set('slow-prewarm', new PrewarmPathProcessor(collectDevPrewarmPaths));
		const adapter = createAdapter({ appConfig, options: { watch: true } });
		adapter.setInitializedForTest();
		let finishWatcherSubscription!: () => void;
		const watcherSubscription = new Promise<void>((resolve) => {
			finishWatcherSubscription = resolve;
		});
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockImplementation(() => watcherSubscription.then(() => undefined as never));
		onTestFinished(() => subscription.mockRestore());

		const initialization = adapter.completeInitialization({} as import('node:http').Server);
		await vi.waitFor(() => expect(subscription).toHaveBeenCalledOnce());

		expect(collectDevPrewarmPaths).not.toHaveBeenCalled();
		finishWatcherSubscription();
		await initialization;
		expect(collectDevPrewarmPaths).not.toHaveBeenCalled();

		const response = await adapter.handleRequest(new Request('http://localhost:3000/'));
		expect(response.status).toBe(200);

		await vi.waitFor(() => expect(collectDevPrewarmPaths).toHaveBeenCalledOnce());
		await adapter.dispose();
	});

	it('keeps serving and logs Processor prewarm collection failures with their stack', async () => {
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: path.join(os.tmpdir(), 'ecopages-failed-prewarm-paths'),
		});
		const failure = new Error('manifest unreadable');
		appConfig.processors.set('failing-prewarm', new PrewarmPathProcessor(async () => Promise.reject(failure)));
		const adapter = createAdapter({ appConfig, options: { watch: true } });
		adapter.setInitializedForTest();
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());
		const errorSpy = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);

		await adapter.completeInitialization({} as import('node:http').Server);
		const response = await adapter.handleRequest(new Request('http://localhost:3000/'));
		await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[ecopages:dev-prewarm] failed', failure));
		expect(response.status).toBe(200);

		await adapter.dispose();
	});
});
