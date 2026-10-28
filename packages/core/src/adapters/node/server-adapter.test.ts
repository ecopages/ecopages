import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { AppRuntime } from '../../config/assembly/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { AppModuleLoader } from '../../build/server/app-module-loader.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import type { NodeServerAdapterParams } from './server-adapter.ts';
import { NodeServerAdapter } from './server-adapter.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';
import { Processor } from '../../plugins/processor.ts';
import { HtmlPagesPlugin } from '../../html-pages/html-pages.plugin.ts';
import { ServerRouteHandler } from '../shared/runtime/server-route-handler.ts';
import { ServerRequestPipeline } from '../shared/runtime/server-request-pipeline.ts';
import { getBuildInputRecordingContext } from '../../build/cache/build-input-dependency-index.ts';

const upgrades = vi.hoisted(() => ({ attach: vi.fn() }));
const devBridge = vi.hoisted(() => ({ reload: vi.fn() }));
const browserManifestPrebuild = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('../shared/ws/node-http-websocket-upgrades.ts', () => ({
	attachNodeHttpWebSocketUpgrades: upgrades.attach,
}));

vi.mock('../../static-site-generator/production-page-browser-graph-prebuild.ts', () => ({
	prebuildProductionPageBrowserGraphsFromManifest: browserManifestPrebuild.run,
}));

const devRuntime = vi.hoisted(() => ({
	websocketServer: {
		clients: new Set(),
		close: (callback?: (error?: Error) => void) => callback?.(),
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

vi.mock('ws', () => ({
	WebSocketServer: class {
		constructor() {
			return devRuntime.websocketServer;
		}
	},
}));

vi.mock('./node-client-bridge.ts', () => ({
	NodeClientBridge: class {
		constructor() {
			return { ...devRuntime.bridge, reload: devBridge.reload };
		}
	},
}));

vi.mock('../shared/hmr/hmr-manager.ts', () => ({
	HmrManager: class {
		constructor() {
			return devRuntime.hmrManager;
		}
	},
}));

class TestNodeServerAdapter extends NodeServerAdapter {
	private skipInitializationForTest = false;

	public setReadyForTest(): void {
		this.skipInitializationForTest = true;
	}

	public override initialize(): Promise<void> {
		return this.skipInitializationForTest ? Promise.resolve() : super.initialize();
	}
}

function makeNodeServerAdapter(
	options?: Partial<NodeServerAdapterParams>,
	runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge()),
) {
	const appConfig =
		options?.appConfig ??
		({
			rootDir: '/tmp/app',
			distDir: '.ecopages',
			integrations: [],
		} as unknown as EcoPagesAppConfig);
	const runtime =
		options?.runtime ??
		appConfig.appRuntime ??
		({
			origin: 'http://localhost:3000',
			hmr: null,
			moduleLoader: new AppModuleLoader(appConfig),
		} as unknown as AppRuntime);
	appConfig.appRuntime ??= runtime;

	return new TestNodeServerAdapter({
		appConfig,
		serveOptions: {},
		options: { watch: true },
		runtimeHost,
		...options,
		runtime,
	});
}

async function requestApiAndPageWithBuildScopeCapture(watch: boolean) {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-request-build-scope-'));
	onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
	fs.mkdirSync(path.join(rootDir, 'src', 'pages'), { recursive: true });
	const appConfig = await finalizeEcoPagesConfig({ rootDir });
	const runtime = requireAppRuntime(appConfig);
	const withRequestScope = vi.spyOn(runtime.buildQueue, 'withRequestScope');
	const recordingIndexes: unknown[] = [];
	const captureIndex = () => {
		recordingIndexes.push(getBuildInputRecordingContext().index);
	};
	const handleResponse = vi.spyOn(ServerRouteHandler.prototype, 'handleResponse').mockImplementation(async () => {
		captureIndex();
		return new Response('page');
	});
	onTestFinished(() => handleResponse.mockRestore());
	const adapter = makeNodeServerAdapter({
		appConfig,
		options: { watch },
		apiHandlers: [
			{
				path: '/api/health',
				method: 'GET',
				handler: () => {
					captureIndex();
					return new Response('ok');
				},
			},
		],
	});

	try {
		const api = await adapter.handleRequest(new Request('http://localhost:3000/api/health'));
		const page = await adapter.handleRequest(new Request('http://localhost:3000/'));
		expect(api.status).toBe(200);
		expect(await api.text()).toBe('ok');
		expect(page.status).toBe(200);
		expect(await page.text()).toBe('page');
		return { withRequestScope, recordingIndexes, appConfig };
	} finally {
		await adapter.dispose();
	}
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

function setTreeMode(root: string, directoryMode: number, fileMode: number): void {
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			setTreeMode(fullPath, directoryMode, fileMode);
		} else {
			fs.chmodSync(fullPath, fileMode);
		}
	}
	fs.chmodSync(root, directoryMode);
}

describe('NodeServerAdapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 499 for normalized client aborts', async () => {
		const adapter = makeNodeServerAdapter({ options: { watch: false } });
		adapter.setReadyForTest();
		vi.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest').mockRejectedValue(new NodeClientAbortError());

		const response = await adapter.handleRequest(new Request('http://localhost:3000/upload'));

		expect(response.status).toBe(499);
	});

	it('routes errors that escape the request pipeline through app.onError', async () => {
		const errorHandler = vi.fn(async () => new Response('handled', { status: 418 }));
		const adapter = makeNodeServerAdapter({ options: { watch: false }, errorHandler });
		adapter.setReadyForTest();
		vi.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest').mockRejectedValue(new Error('boom'));

		const response = await adapter.handleRequest(new Request('http://localhost:3000/page'));

		expect(response.status).toBe(418);
		expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.anything());
	});

	it('answers escaped errors with 500 when no onError handler is registered', async () => {
		const adapter = makeNodeServerAdapter({ options: { watch: false } });
		adapter.setReadyForTest();
		vi.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest').mockRejectedValue(new Error('boom'));

		const response = await adapter.handleRequest(new Request('http://localhost:3000/page'));

		expect(response.status).toBe(500);
	});

	it('builds static pages without an ephemeral build server', async () => {
		const staticBuilderBuild = vi.fn().mockResolvedValue(undefined);
		const adapter = makeNodeServerAdapter({ options: { watch: false } });
		adapter.setReadyForTest();
		(adapter as unknown as { staticBuilder: { build: typeof staticBuilderBuild } }).staticBuilder = {
			build: staticBuilderBuild,
		};

		await adapter.buildStatic({ force: true, keepGoing: true });

		expect(staticBuilderBuild).toHaveBeenCalledWith(
			expect.objectContaining({ baseUrl: 'http://localhost:3000', force: true, keepGoing: true }),
			expect.any(Object),
		);
	});

	it('serves preview output through the runtime host', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-preview-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'about.html'), '<h1>About</h1>');
		const adapter = makeNodeServerAdapter({
			appConfig,
			serveOptions: { hostname: '127.0.0.1', port: await getAvailablePort() },
			options: { watch: false },
		});

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

	it('previewing a finished build leaves it untouched', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-serve-only-untouched-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const distDir = appConfig.absolutePaths.distDir;
		const publicDir = appConfig.absolutePaths.publicDir;
		const builtRobots = 'User-agent: *\nDisallow:';
		fs.mkdirSync(distDir, { recursive: true });
		fs.mkdirSync(publicDir, { recursive: true });
		fs.writeFileSync(path.join(distDir, 'robots.txt'), builtRobots);
		fs.writeFileSync(path.join(distDir, 'about.html'), '<h1>About</h1>');
		fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /');
		fs.writeFileSync(path.join(publicDir, 'extra.txt'), 'after-build');
		const adapter = makeNodeServerAdapter({
			appConfig,
			serveOptions: { hostname: '127.0.0.1', port: await getAvailablePort() },
			options: { watch: false },
			runtimeAssetSetup: 'none',
		});

		try {
			const previewOrigin = await adapter.servePreviewOnly();
			if (!previewOrigin) throw new Error('Expected a preview origin');
			const robots = await fetch(`${previewOrigin}/robots.txt`);
			const about = await fetch(`${previewOrigin}/about`);

			expect(fs.readFileSync(path.join(distDir, 'robots.txt'), 'utf8')).toBe(builtRobots);
			expect(fs.existsSync(path.join(distDir, 'extra.txt'))).toBe(false);
			expect(robots.status).toBe(200);
			expect(await robots.text()).toBe(builtRobots);
			expect(about.status).toBe(200);
			expect(await about.text()).toBe('<h1>About</h1>');
		} finally {
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('serves a page from a read-only dist in serve-only preview', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-serve-only-readonly-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const distDir = appConfig.absolutePaths.distDir;
		fs.mkdirSync(distDir, { recursive: true });
		fs.mkdirSync(appConfig.absolutePaths.publicDir, { recursive: true });
		fs.writeFileSync(path.join(distDir, 'about.html'), '<h1>About</h1>');
		fs.writeFileSync(path.join(appConfig.absolutePaths.publicDir, 'robots.txt'), 'User-agent: *\nAllow: /');
		setTreeMode(distDir, 0o555, 0o444);
		const adapter = makeNodeServerAdapter({
			appConfig,
			serveOptions: { hostname: '127.0.0.1', port: await getAvailablePort() },
			options: { watch: false },
			runtimeAssetSetup: 'none',
		});

		try {
			const previewOrigin = await adapter.servePreviewOnly();
			if (!previewOrigin) throw new Error('Expected a preview origin');
			const response = await fetch(`${previewOrigin}/about`);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('<h1>About</h1>');
		} finally {
			setTreeMode(distDir, 0o755, 0o644);
			await adapter.dispose();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('does not restart a preview after disposal begins during replacement shutdown', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-preview-stop-race-'));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const adapter = makeNodeServerAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);
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
		const adapter = makeNodeServerAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);
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
		const adapter = makeNodeServerAdapter(
			{
				appConfig,
				serveOptions: { hostname: '127.0.0.1', port: 0 },
				options: { watch: false },
			},
			runtimeHost,
		);

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
					fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'generated.txt'), 'generated');
				}
			})({ name: 'generating-processor' });
			const appConfig = await finalizeEcoPagesConfig({ rootDir, processors: [processor] });
			fs.mkdirSync(appConfig.absolutePaths.publicDir, { recursive: true });
			const publicAsset = path.join(appConfig.absolutePaths.publicDir, 'logo.svg');
			fs.writeFileSync(publicAsset, '<svg />');
			fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
			fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'stale.txt'), 'stale');
			const adapter = makeNodeServerAdapter({ appConfig, options: { watch: false }, runtimeAssetSetup });
			const copyFile = vi.spyOn(fileSystem, 'copyFile');
			vi.spyOn(ServerRequestPipeline.prototype, 'initializeRouteHandling').mockImplementation(async () => {
				events.push('routes read');
			});

			await adapter.initialize();

			return { events, rootDir, copyFile, publicAsset };
		}

		it('refuses production start when dist/ is incomplete, without writing into dist/', async () => {
			vi.stubEnv('NODE_ENV', 'production');
			onTestFinished(() => {
				vi.unstubAllEnvs();
			});
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-incomplete-dist-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			fs.mkdirSync(path.join(rootDir, 'src', 'public'), { recursive: true });
			fs.writeFileSync(path.join(rootDir, 'src', 'public', 'logo.svg'), '<svg />');
			const appConfig = await finalizeEcoPagesConfig({ rootDir });
			const adapter = makeNodeServerAdapter({
				appConfig,
				options: { watch: false },
				requireCompleteDist: true,
			});

			await expect(adapter.initialize()).rejects.toThrow(/production bundle manifest .* is missing/);
			await adapter.dispose();
			expect(fs.existsSync(path.join(rootDir, 'dist'))).toBe(false);
		});

		it.each(['start', 'export'] as const)(
			'sets Processors up before the routes are read in %s mode',
			async (mode) => {
				const { events } = await initializeWith(mode);

				expect(events).toEqual(['processor setup', 'routes read']);
			},
		);

		it('copies the public directory in start mode', async () => {
			const { rootDir } = await initializeWith('start');

			expect(fs.readFileSync(path.join(rootDir, 'dist', 'client', 'logo.svg'), 'utf8')).toBe('<svg />');
		});

		it('copies the public directory once when export preparation clears dist', async () => {
			const { rootDir, copyFile, publicAsset } = await initializeWith('export');
			const publicAssetCopies = copyFile.mock.calls.filter(([source]) => source === publicAsset);

			expect(publicAssetCopies).toHaveLength(1);
			expect(fs.readFileSync(path.join(rootDir, 'dist', 'client', 'logo.svg'), 'utf8')).toBe('<svg />');
			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'assets'))).toBe(true);
		});

		it('sets Integrations up before non-watch network requests are released', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-integration-setup-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			const events: string[] = [];
			const integration = new HtmlPagesPlugin();
			vi.spyOn(integration, 'setup').mockImplementation(async () => {
				events.push('integration setup');
			});
			const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [integration] });
			const adapter = makeNodeServerAdapter({ appConfig, options: { watch: false } });
			vi.spyOn(ServerRequestPipeline.prototype, 'initializeRouteHandling').mockImplementation(async () => {
				events.push('routes read');
			});

			await adapter.initialize();
			expect(events).toEqual(['routes read']);

			await adapter.completeInitialization({} as import('node:http').Server);

			expect(events).toEqual(['routes read', 'integration setup']);
		});

		it('restores the production browser manifest after Integration setup', async () => {
			browserManifestPrebuild.run.mockReset();
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-runtime-browser-manifest-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			const events: string[] = [];
			let releaseManifestRestore!: () => void;
			const manifestRestore = new Promise<void>((resolve) => {
				releaseManifestRestore = resolve;
			});
			const integration = new HtmlPagesPlugin();
			vi.spyOn(integration, 'setup').mockImplementation(async () => {
				events.push('integration setup');
			});
			browserManifestPrebuild.run.mockImplementation(async () => {
				events.push('browser manifest restore started');
				await manifestRestore;
				events.push('browser manifest restored');
			});
			const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [integration] });
			const adapter = makeNodeServerAdapter({ appConfig, options: { watch: false } });
			vi.spyOn(ServerRequestPipeline.prototype, 'initializeRouteHandling').mockImplementation(async () => {
				events.push('routes read');
			});

			await adapter.initialize();
			const initialization = adapter.completeInitialization({} as import('node:http').Server);
			await vi.waitFor(() => expect(events).toContain('browser manifest restore started'));
			const handleSharedRequest = vi
				.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest')
				.mockResolvedValue(new Response('ok'));
			const request = adapter.handleServerRequest(new Request('http://localhost:3000/page'));
			await Promise.resolve();

			expect(handleSharedRequest).not.toHaveBeenCalled();
			releaseManifestRestore();
			await initialization;
			await request;

			expect(events).toEqual([
				'routes read',
				'integration setup',
				'browser manifest restore started',
				'browser manifest restored',
			]);
			expect(handleSharedRequest).toHaveBeenCalledTimes(1);
			expect(browserManifestPrebuild.run).toHaveBeenCalledTimes(1);
			expect(browserManifestPrebuild.run.mock.calls[0]?.[0]).toBe(appConfig);
		});

		it('empties dist before an export sets Processors up and keeps what they generate', async () => {
			const { rootDir } = await initializeWith('export');

			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'stale.txt'))).toBe(false);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'generated.txt'))).toBe(true);
		});

		it('leaves Processors and dist alone when a preview only serves an earlier export', async () => {
			const { events, rootDir } = await initializeWith('none');

			expect(events).toEqual(['routes read']);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'stale.txt'))).toBe(true);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'logo.svg'))).toBe(false);
			expect(fs.existsSync(path.join(rootDir, 'dist', 'client', 'assets'))).toBe(false);
		});
	});

	describe('completeInitialization upgrade wiring', () => {
		const server = {} as import('node:http').Server;

		beforeEach(() => {
			upgrades.attach.mockReset();
		});

		it('attaches user upgrades without a preflight when serving without watch', async () => {
			const adapter = makeNodeServerAdapter({ options: { watch: false } });

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
			const adapter = makeNodeServerAdapter({ options: { watch: true } });

			await expect(adapter.completeInitialization(server)).rejects.toBe(wiringDone);

			expect(upgrades.attach).toHaveBeenCalledWith(
				server,
				expect.objectContaining({ preflight: expect.any(Function) }),
			);
		});

		it('waits for watch-mode Integration setup before handling requests', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-watch-integration-readiness-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
			let finishSetup!: () => void;
			const setupGate = new Promise<void>((resolve) => {
				finishSetup = resolve;
			});
			const setupEvents: string[] = [];
			class PendingSetupIntegration extends HtmlPagesPlugin {
				override async setup(): Promise<void> {
					setupEvents.push('started');
					await setupGate;
					setupEvents.push('finished');
				}
			}
			const integration = new PendingSetupIntegration();
			const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [integration] });
			const adapter = makeNodeServerAdapter({ appConfig, options: { watch: true } });
			adapter.setReadyForTest();
			vi.spyOn(ServerRequestPipeline.prototype, 'configureResponseHandlers').mockImplementation(() => {});
			const expectedResponse = new Response('ready');
			const handleSharedRequest = vi
				.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest')
				.mockResolvedValue(expectedResponse);
			const initialization = adapter.completeInitialization(server);
			const response = adapter.handleServerRequest(new Request('http://localhost:3000/page'));

			try {
				await vi.waitFor(() => expect(setupEvents).toContain('started'));
				await new Promise<void>((resolve) => setImmediate(resolve));

				expect(setupEvents).not.toContain('finished');
				expect(handleSharedRequest).not.toHaveBeenCalled();

				finishSetup();
				await initialization;

				await expect(response).resolves.toBe(expectedResponse);
				expect(setupEvents).toEqual(['started', 'finished']);
				expect(handleSharedRequest).toHaveBeenCalledTimes(1);
			} finally {
				finishSetup();
				await Promise.allSettled([initialization, response]);
				await adapter.dispose();
			}
		});

		it('renders a filesystem Page for request-only fetches in watch mode', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-watch-fetch-page-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			fs.mkdirSync(path.join(rootDir, 'src', 'pages'), { recursive: true });
			fs.writeFileSync(path.join(rootDir, 'src', 'pages', 'index.html'), '<h1>Request-only page</h1>');
			const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const adapter = new NodeServerAdapter({
				appConfig,
				runtime: appConfig.appRuntime!,
				serveOptions: {},
				options: { watch: true },
				runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
			});

			try {
				const response = await adapter.handleRequest(new Request('http://localhost:3000/'));

				expect(response.status).toBe(200);
				expect(await response.text()).toContain('<h1>Request-only page</h1>');
			} finally {
				await adapter.dispose();
			}
		});

		it('handles request-only fetches without waiting for the watch-mode listener', async () => {
			const adapter = makeNodeServerAdapter({ options: { watch: true } });
			adapter.setReadyForTest();
			const expectedResponse = new Response('ready');
			const handleSharedRequest = vi
				.spyOn(ServerRequestPipeline.prototype, 'handleSharedRequest')
				.mockResolvedValue(expectedResponse);

			await expect(adapter.handleRequest(new Request('http://localhost:3000/page'))).resolves.toBe(
				expectedResponse,
			);
			expect(handleSharedRequest).toHaveBeenCalledTimes(1);
		});

		it('does not initialize unused Integrations for request-only API fetches in watch mode', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-watch-fetch-api-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			fs.mkdirSync(path.join(rootDir, 'src', 'pages'), { recursive: true });
			let setupCalls = 0;
			class FailingUnusedIntegration extends HtmlPagesPlugin {
				override async setup(): Promise<void> {
					setupCalls += 1;
					throw new Error('Unused Integration must not be initialized');
				}
			}
			const appConfig = await finalizeEcoPagesConfig({
				rootDir,
				integrations: [new FailingUnusedIntegration()],
			});
			const adapter = new NodeServerAdapter({
				appConfig,
				runtime: appConfig.appRuntime!,
				serveOptions: {},
				options: { watch: true },
				apiHandlers: [{ path: '/api/health', method: 'GET', handler: () => new Response('ok') }],
				runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
			});

			try {
				const response = await adapter.handleRequest(new Request('http://localhost:3000/api/health'));

				expect(response.status).toBe(200);
				expect(await response.text()).toBe('ok');
				expect(setupCalls).toBe(0);
			} finally {
				await adapter.dispose();
			}
		});

		it('does not initialize unused Integrations for request-only API fetches without watch mode', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-fetch-api-'));
			onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
			fs.mkdirSync(path.join(rootDir, 'src', 'pages'), { recursive: true });
			let setupCalls = 0;
			class FailingUnusedIntegration extends HtmlPagesPlugin {
				override async setup(): Promise<void> {
					setupCalls += 1;
					throw new Error('Unused Integration must not be initialized');
				}
			}
			const appConfig = await finalizeEcoPagesConfig({
				rootDir,
				integrations: [new FailingUnusedIntegration()],
			});
			const adapter = new NodeServerAdapter({
				appConfig,
				runtime: appConfig.appRuntime!,
				serveOptions: {},
				options: { watch: false },
				apiHandlers: [{ path: '/api/health', method: 'GET', handler: () => new Response('ok') }],
				runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
			});

			try {
				const response = await adapter.handleRequest(new Request('http://localhost:3000/api/health'));

				expect(response.status).toBe(200);
				expect(await response.text()).toBe('ok');
				expect(setupCalls).toBe(0);
			} finally {
				await adapter.dispose();
			}
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
			const adapter = makeNodeServerAdapter({ options: { watch: true } });
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
		const adapter = makeNodeServerAdapter({ appConfig });
		vi.spyOn(ServerRequestPipeline.prototype, 'configureResponseHandlers').mockImplementation(() => {});
		let emitFileChange: ((change: { type: 'change'; path: string }) => void) | undefined;
		const watch = vi.spyOn(fileSystem, 'watch').mockImplementation((_paths, options) => {
			emitFileChange = options.onChange;
			return { ready: Promise.resolve(), add: vi.fn(async () => {}), close: vi.fn(async () => {}) };
		});
		onTestFinished(() => watch.mockRestore());
		devBridge.reload.mockClear();

		await adapter.completeInitialization({} as import('node:http').Server);
		emitFileChange?.({ type: 'change', path: path.join(appConfig.absolutePaths.publicDir, 'robots.txt') });

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
		const adapter = makeNodeServerAdapter({ appConfig, options: { watch: true } });
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

	it('reports a failed preview stop and a failed dev-session dispose together and still tears down Integrations', async () => {
		const teardown = vi.fn(async () => {});
		class ResourceIntegration extends HtmlPagesPlugin {
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {
				await teardown();
			}
		}
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-dispose-errors-'));
		onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [new ResourceIntegration()] });
		fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
		const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const adapter = makeNodeServerAdapter(
			{ appConfig, serveOptions: { hostname: '127.0.0.1', port: 0 }, options: { watch: true } },
			runtimeHost,
		);
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());
		const destroyBridge = vi.spyOn(devRuntime.bridge, 'destroy').mockImplementationOnce(() => {
			throw new Error('bridge destroy failed');
		});
		onTestFinished(() => destroyBridge.mockRestore());
		const startServer = vi.spyOn(runtimeHost, 'start');
		const stopServer = runtimeHost.stop.bind(runtimeHost);
		vi.spyOn(runtimeHost, 'stop').mockRejectedValueOnce(new Error('preview close failed'));

		await adapter.completeInitialization({} as import('node:http').Server);
		expect(await adapter.servePreviewOnly()).toBeDefined();
		const previewServer = await startServer.mock.results[0]!.value;
		onTestFinished(() => stopServer(previewServer));

		const disposal = adapter.dispose();

		await expect(disposal).rejects.toBeInstanceOf(AggregateError);
		const { errors } = (await disposal.catch((error: unknown) => error)) as AggregateError;
		expect(errors.map((error: Error) => error.message)).toEqual(['bridge destroy failed', 'preview close failed']);
		expect(teardown).toHaveBeenCalledOnce();
	});

	it('does not enter a build queue scope or record build inputs on production API and Page requests', async () => {
		const { withRequestScope, recordingIndexes } = await requestApiAndPageWithBuildScopeCapture(false);

		expect(withRequestScope).not.toHaveBeenCalled();
		expect(recordingIndexes).toEqual([undefined, undefined]);
	});

	it('enters a build queue scope and records build inputs on development API and Page requests', async () => {
		const { withRequestScope, recordingIndexes, appConfig } = await requestApiAndPageWithBuildScopeCapture(true);
		const buildInputIndex = requireAppRuntime(appConfig).buildInputIndex;

		expect(withRequestScope).toHaveBeenCalledTimes(2);
		expect(recordingIndexes).toHaveLength(2);
		expect(recordingIndexes[0]).toBe(buildInputIndex);
		expect(recordingIndexes[1]).toBe(buildInputIndex);
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
		const adapter = makeNodeServerAdapter({ appConfig, options: { watch: true } });
		const subscription = vi
			.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription')
			.mockResolvedValue(undefined as never);
		onTestFinished(() => subscription.mockRestore());

		await adapter.completeInitialization({} as import('node:http').Server);
		await vi.waitFor(() => expect(recordingIndexes).toHaveLength(1));

		await adapter.dispose();

		expect(recordingIndexes).toEqual([requireAppRuntime(appConfig).buildInputIndex]);
	});
});
