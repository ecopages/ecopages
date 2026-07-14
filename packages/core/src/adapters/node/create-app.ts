import { appLogger } from '../../global/app-logger.ts';
import type { StaticRoute } from '../../types/public-types.ts';
import { SharedApplicationAdapter } from '../shared/application-adapter.ts';
import { resolveRuntimeBinding, resolveStaticRuntimeMode } from '../shared/runtime-app-bootstrap.ts';
import type { RuntimeHost } from '../shared/runtime-host.ts';
import type { EcopagesAppOptions } from '../create-app.ts';
import { type NodeServerAdapterResult, createNodeServerAdapter } from './server-adapter.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import type { NodeServerInstance } from './server-adapter.ts';
import { NodeRuntimeHost } from './runtime-host.ts';
import { hostOwnsDevClient } from '../../dev/dev-client-ownership.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';

export class NodeEcopagesApp extends SharedApplicationAdapter<EcopagesAppOptions, NodeServerInstance, Request> {
	serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private runtimeOrigin = '';
	private stopped = false;
	private readonly runtimeHost: RuntimeHost<NodeServerInstance, { port?: number; hostname?: string }>;

	constructor(
		options: EcopagesAppOptions,
		dependencies: {
			runtimeHost: RuntimeHost<NodeServerInstance, { port?: number; hostname?: string }>;
		},
	) {
		super(options, 'Node');
		this.runtimeHost = dependencies.runtimeHost;
	}

	protected createServerAdapter(
		params: Parameters<typeof createNodeServerAdapter>[0],
	): Promise<NodeServerAdapterResult> {
		return createNodeServerAdapter(params);
	}

	public override async stop(force = true): Promise<void> {
		if (this.stopped) {
			return;
		}

		if (this.server) {
			const activeServer = this.server;
			this.server = null;
			await this.runtimeHost.stop(activeServer, { force });
		}

		if (this.serverAdapter) {
			await this.serverAdapter.dispose();
		}

		this.stopped = true;
	}

	protected async initializeServerAdapter(): Promise<NodeServerAdapterResult> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		this.runtimeOrigin = binding.runtimeOrigin;

		return this.createServerAdapter({
			runtimeOrigin: this.runtimeOrigin,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes as StaticRoute[],
			errorHandler: this.errorHandler,
			websocketHandlers: this.websocketHandlers.size > 0 ? this.websocketHandlers : undefined,
			options: { watch: binding.watch },
			serveOptions: binding.serveOptions,
			hostOwnsDevClient: hostOwnsDevClient(this.runtimeOptions),
			deferRuntimeAssetSetup: resolveStaticRuntimeMode({
				appConfig: this.appConfig,
				cliArgs: this.cliArgs,
			}).canBuildWithoutRuntimeServer,
			allowPortFallback: binding.allowPortFallback,
		});
	}

	protected async bootServer(): Promise<NodeServerInstance | void> {
		if (this.stopped) {
			this.serverAdapter = undefined;
			this.stopped = false;
		}

		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		if (this.server) {
			return this.server;
		}

		const { build, preview, force, serveOnly } = this.cliArgs;

		if (preview && serveOnly) {
			const previewOrigin = await this.serverAdapter.servePreviewOnly();
			if (previewOrigin) {
				this.notifyListening(previewOrigin);
			}
			return;
		}

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			const previewOrigin = await this.serverAdapter.buildStatic({ preview, force });
			appLogger.debugTimeEnd('Building static pages');

			if (preview && previewOrigin) {
				this.notifyListening(previewOrigin);
			}

			if (build) {
				process.exit(0);
			}
			return;
		}

		const serveOptions = this.serverAdapter.getServerOptions();
		startupTrace.beginServerListen();
		this.server = await this.runtimeHost.start({
			serveOptions,
			handleRequest: async (request) => await this.serverAdapter!.handleRequest(request),
			onError: async () => {},
		});
		this.runtimeOrigin = this.runtimeHost.getOrigin(this.server, serveOptions);

		await this.serverAdapter.completeInitialization(this.server);
		this.notifyListening(this.runtimeOrigin);

		return this.server;
	}

	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		return this.serverAdapter.handleRequest(request);
	}

	public async attachWebSocketUpgrades(
		httpServer: import('node:http').Server,
		options?: { passthroughUnmatched?: boolean },
	): Promise<void> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		if (!this.server) {
			this.server = httpServer;
			await this.serverAdapter.completeInitialization(httpServer);
			return;
		}

		this.serverAdapter.attachUserWebSocketUpgrades(httpServer, options);
	}
}

export async function createNodeApp(options: EcopagesAppOptions): Promise<NodeEcopagesApp> {
	return new NodeEcopagesApp(options, {
		runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
	});
}

export async function createApp(options: EcopagesAppOptions): Promise<NodeEcopagesApp> {
	return createNodeApp(options);
}
