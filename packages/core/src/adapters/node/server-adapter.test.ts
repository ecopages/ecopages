import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import chokidar from 'chokidar';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { AppRuntime } from '../../config/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import type { NodeServerAdapterParams } from './server-adapter.ts';
import { NodeServerAdapter } from './server-adapter.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';
import { Processor } from '../../plugins/processor.ts';
import { HtmlPagesPlugin } from '../../html-pages/html-pages.plugin.ts';
import { ServerRouteHandler } from '../shared/runtime/server-route-handler.ts';
import {
	getAppBuildInputIndex,
	getBuildInputRecordingContext,
} from '../../build/cache/build-input-dependency-index.ts';

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

	public override async handleSharedRequest(): Promise<Response> {
		if (this.handleSharedRequestImpl) {
			return await this.handleSharedRequestImpl();
		}

		return new Response('<html><body><h1>Explicit route</h1></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
	}
}

function createAdapter(
	options?: Partial<NodeServerAdapterParams>,
	runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge()),
) {
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
		runtimeHost,
		...options,
		runtime: options?.runtime ?? ({ origin: 'http://localhost:3000', hmr: null } as AppRuntime),
	});
}

async function getAvailablePort(): Promise<number> {
	const server = net.createServer();
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Expected an available TCP port');
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

describe('NodeServerAdapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
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

	it('serves preview output through the runtime host', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-preview-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'about.html'), '<h1>About</h1>');
		const adapter = createAdapter({
			appConfig,
			serveOptions: { hostname: '127.0.0.1', port: await getAvailablePort() },
			options: { watch: false },
		});
		adapter.setInitializedForTest();

		try {
			const previewOrigin = await adapter.servePreviewOnly();
			if (!previewOrigin) throw new Error('Expected a preview origin');
			const response = await fetch(`${previewOrigin}/about`);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('<h1>About</h1>');
		} finally {
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('does not restart a preview after disposal begins during replacement shutdown', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-preview-stop-race-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const adapter = createAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);
		adapter.setInitializedForTest();
		let releaseStop!: () => void;
		const stopGate = new Promise<void>((resolve) => {
			releaseStop = resolve;
		});
		let stopCalls = 0;
		let replacement: Promise<string | undefined> | undefined;
		let disposal: Promise<void> | undefined;

		try {
			const previewOrigin = await adapter.servePreviewOnly();
			expect(previewOrigin).toBeDefined();
			const stopServer = runtimeHost.stop.bind(runtimeHost);
			const stop = vi.spyOn(runtimeHost, 'stop').mockImplementation(async (server, options) => {
				stopCalls += 1;
				if (stopCalls === 1) await stopGate;
				await stopServer(server, options);
			});
			const start = vi.spyOn(runtimeHost, 'start');

			replacement = adapter.servePreviewOnly();
			await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1), { interval: 1, timeout: 100 });
			disposal = adapter.dispose();
			releaseStop();

			await expect(replacement).rejects.toThrow('adapter disposal has begun');
			await disposal;
			expect(stop).toHaveBeenCalledTimes(1);
			expect(start).not.toHaveBeenCalled();
		} finally {
			releaseStop();
			await Promise.allSettled([...(replacement ? [replacement] : []), ...(disposal ? [disposal] : [])]);
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('stops a preview whose replacement finishes binding after disposal begins', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-preview-start-race-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const adapter = createAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);
		adapter.setInitializedForTest();
		let releaseStart!: () => void;
		const startGate = new Promise<void>((resolve) => {
			releaseStart = resolve;
		});
		let replacement: Promise<string | undefined> | undefined;
		let disposal: Promise<void> | undefined;

		try {
			expect(await adapter.servePreviewOnly()).toBeDefined();
			const startServer = runtimeHost.start.bind(runtimeHost);
			const start = vi.spyOn(runtimeHost, 'start').mockImplementation(async (options) => {
				await startGate;
				return startServer(options);
			});
			const stopServer = runtimeHost.stop.bind(runtimeHost);
			const stop = vi.spyOn(runtimeHost, 'stop').mockImplementation(async (server, options) => {
				await stopServer(server, options);
			});

			replacement = adapter.servePreviewOnly();
			await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1), { interval: 1, timeout: 100 });
			disposal = adapter.dispose();
			releaseStart();

			await expect(replacement).rejects.toThrow('adapter disposal has begun');
			await disposal;
			expect(stop).toHaveBeenCalledTimes(2);
		} finally {
			releaseStart();
			await Promise.allSettled([...(replacement ? [replacement] : []), ...(disposal ? [disposal] : [])]);
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('retries preview shutdown after a failed close through the public preview path', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-preview-stop-retry-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'about.html'), '<h1>About</h1>');
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const adapter = createAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);
		adapter.setInitializedForTest();

		try {
			expect(await adapter.servePreviewOnly()).toBeDefined();
			const stopServer = runtimeHost.stop.bind(runtimeHost);
			const stop = vi
				.spyOn(runtimeHost, 'stop')
				.mockRejectedValueOnce(new Error('close failed'))
				.mockImplementation(async (server, options) => await stopServer(server, options));

			await expect(adapter.servePreviewOnly()).rejects.toThrow('close failed');
			expect(stop).toHaveBeenCalledTimes(1);

			const retriedOrigin = await adapter.servePreviewOnly();
			expect(retriedOrigin).toBeDefined();
			expect(stop).toHaveBeenCalledTimes(2);
			const response = await fetch(`${retriedOrigin}/about`);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('<h1>About</h1>');
		} finally {
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	describe('runtime asset setup', () => {
		async function initializeWith(runtimeAssetSetup: 'start' | 'export' | 'none') {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-asset-setup-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			const events: string[] = [];
			const processor = new (class extends Processor {
				override async setup(): Promise<void> {
					events.push('processor setup');
					fs.writeFileSync(path.join(rootDir, 'dist', 'generated.txt'), 'generated');
				}
			})({ name: 'generating-processor' });
			const appConfig = await finalizeEcoPagesConfig({ rootDir, processors: [processor] });
			fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
			fs.writeFileSync(path.join(rootDir, 'dist', 'stale.txt'), 'stale');
			const adapter = createAdapter({ appConfig, options: { watch: false }, runtimeAssetSetup });
			vi.spyOn(
				adapter as unknown as { initializeSharedRouteHandling: () => Promise<void> },
				'initializeSharedRouteHandling',
			).mockImplementation(async () => {
				events.push('routes read');
			});

			await adapter.initialize();

			return { events, rootDir };
		}

		it.each(['start', 'export'] as const)(
			'sets Processors up before the routes are read in %s mode',
			async (mode) => {
				const { events } = await initializeWith(mode);

				expect(events).toEqual(['processor setup', 'routes read']);
			},
		);

		it('empties dist before an export sets Processors up and keeps what they generate', async () => {
			const { rootDir } = await initializeWith('export');

			expect(fs.existsSync(path.join(rootDir, 'dist', 'stale.txt'))).toBe(false);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'generated.txt'))).toBe(true);
		});

		it('leaves Processors and dist alone when a preview only serves an earlier export', async () => {
			const { events, rootDir } = await initializeWith('none');

			expect(events).toEqual(['routes read']);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'stale.txt'))).toBe(true);
		});
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
		const fileEvents = Object.assign(new EventEmitter(), {
			add: vi.fn(),
			close: vi.fn(async () => {}),
			getWatched: vi.fn(() => ({})),
		});
		const watch = vi.spyOn(chokidar, 'watch').mockImplementation(() => {
			setTimeout(() => fileEvents.emit('ready'), 0);
			return fileEvents as never;
		});
		onTestFinished(() => watch.mockRestore());
		devBridge.reload.mockClear();

		await adapter.completeInitialization({} as import('node:http').Server);
		fileEvents.emit('change', path.join(appConfig.absolutePaths.publicDir, 'robots.txt'));

		await vi.waitFor(() => expect(devBridge.reload).toHaveBeenCalledTimes(1));
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

	it('prewarms the paths a Processor added after finalization and records the build inputs the render reads', async () => {
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: path.join(os.tmpdir(), 'ecopages-prewarm-build-inputs'),
		});
		appConfig.devPrewarmPaths = ['/prewarmed', '/prewarmed'];
		const recordingIndexes: unknown[] = [];
		const handleResponse = vi
			.spyOn(ServerRouteHandler.prototype, 'handleResponse')
			.mockImplementation(async (request: Request) => {
				if (new URL(request.url).pathname === '/prewarmed') {
					recordingIndexes.push(getBuildInputRecordingContext().index);
				}
				return new Response('ok');
			});
		onTestFinished(() => handleResponse.mockRestore());
		const adapter = createAdapter({ appConfig, options: { watch: true } });
		adapter.setInitializedForTest();
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());

		await adapter.completeInitialization({} as import('node:http').Server);
		await vi.waitFor(() => expect(recordingIndexes).toHaveLength(1));

		await adapter.dispose();

		expect(recordingIndexes).toEqual([getAppBuildInputIndex(appConfig)]);
	});
});
