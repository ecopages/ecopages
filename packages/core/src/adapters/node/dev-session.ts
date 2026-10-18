import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { appLogger } from '../../global/app-logger.ts';
import type { AppRuntime } from '../../config/assembly/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcopagesWebSocketHandler } from '../../types/contracts.ts';
import {
	attachHmrToIntegrations,
	disposeDevResources,
	startDevWarmup,
} from '../shared/runtime/runtime-server-lifecycle.ts';
import { startDevStaticRoutePrewarm } from '../shared/runtime/dev-static-route-prewarm.ts';
import type { ServerRequestPipeline } from '../shared/runtime/server-request-pipeline.ts';
import type { NodeServerInstance } from './server-adapter.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { HmrManager } from '../shared/hmr/hmr-manager.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { entryWatcherOwnsConfig } from '../../dev/development-restart.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';

export type DevSessionOptions = {
	appConfig: EcoPagesAppConfig;
	runtime: AppRuntime;
	server: NodeServerInstance;
	requestPipeline: ServerRequestPipeline;
	websocketHandlers: Map<string, EcopagesWebSocketHandler<unknown, Record<string, string>>>;
	onDevelopmentRestart?: (changedFile: string) => Promise<void>;
	configureResponseHandlers: () => void;
	createWatchRefreshCallback: () => () => Promise<void>;
};

export async function disposeDevWebSocketServer(websocketServer: WebSocketServer): Promise<void> {
	for (const client of websocketServer.clients) {
		client.terminate();
	}

	await new Promise<void>((resolve, reject) => {
		websocketServer.close((error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

/**
 * Owns the resources that exist only for a watch-mode server session.
 */
export class DevSession {
	private readonly bridge = new NodeClientBridge();
	private readonly hmrManager: HmrManager;
	private readonly websocketServer = new WebSocketServer({ noServer: true });
	private readonly prewarmAbort = new AbortController();
	private watcher: ProjectWatcher | undefined;
	private prewarm: Promise<void> | undefined;
	private disposePromise: Promise<void> | undefined;

	constructor(private readonly options: DevSessionOptions) {
		this.hmrManager = new HmrManager({ appConfig: options.appConfig, bridge: this.bridge });
	}

	public async start(): Promise<void> {
		const { appConfig, runtime, server, websocketHandlers } = this.options;
		runtime.hmr = this.hmrManager;
		this.hmrManager.setEnabled(true);
		await this.hmrManager.ensureRuntimeReady();

		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: runtime.origin,
			websocketHandlers,
			preflight: (request, socket, head) => this.handleHmrUpgrade(request, socket, head),
		});

		attachHmrToIntegrations(appConfig);
		await startDevWarmup({ appConfig });
		this.options.configureResponseHandlers();

		this.watcher = new ProjectWatcher({
			config: appConfig,
			refreshRouterRoutesCallback: this.options.createWatchRefreshCallback(),
			hmrManager: this.hmrManager,
			bridge: this.bridge,
			onRestartRequest: this.options.onDevelopmentRestart,
			entryWatcherOwnsConfig: entryWatcherOwnsConfig(),
		});
		await this.watcher.createWatcherSubscription();

		this.prewarm = startDevStaticRoutePrewarm({
			pathnames: [...new Set(appConfig.devPrewarmPaths)],
			signal: this.prewarmAbort.signal,
			renderPath: (pathname) => this.options.requestPipeline.renderDevPrewarmPath(pathname, runtime.origin),
		});
	}

	public dispose(): Promise<void> {
		this.disposePromise ??= this.disposeResources();
		return this.disposePromise;
	}

	private async disposeResources(): Promise<void> {
		this.prewarmAbort.abort();
		const errors: unknown[] = [];
		try {
			await this.prewarm;
		} catch (error) {
			errors.push(error);
		}
		try {
			await disposeDevWebSocketServer(this.websocketServer);
		} catch (error) {
			errors.push(error);
		}
		try {
			await disposeDevResources({
				projectWatcher: this.watcher,
				appConfig: this.options.appConfig,
				hmrManager: this.hmrManager,
				bridge: this.bridge,
				stopPreviewServer: async () => {},
			});
		} catch (error) {
			errors.push(error);
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, 'Failed to dispose the development session');
	}

	private handleHmrUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
		const { runtime } = this.options;
		const url = new URL(request.url ?? '/', runtime.origin);
		if (url.pathname !== '/_hmr') return false;

		this.websocketServer.handleUpgrade(request, socket, head, (ws) => {
			this.bridge.subscribe(ws);
			this.hmrManager.sendPendingBuildErrors(ws);
			ws.on('close', () => this.bridge.unsubscribe(ws));
			ws.on('error', (error) => appLogger.error('[HMR] WebSocket error:', error));
		});
		return true;
	}
}
