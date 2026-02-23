import { createServer, type IncomingMessage, type Server as NodeHttpServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { defaultBuildAdapter } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';
import type { ApiHandler, ErrorHandler, StaticRoute } from '../../public-types.ts';

import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { SharedServerAdapter } from '../shared/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ServerStaticBuilder } from '../shared/server-static-builder.ts';

import { NodeStaticContentServer } from './static-content-server.ts';

export type NodeServerInstance = NodeHttpServer;
export type NodeServeAdapterServerOptions = {
	port?: number;
	hostname?: string;
	[key: string]: unknown;
};

export interface NodeServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: NodeServeAdapterServerOptions;
	apiHandlers?: ApiHandler[];
	staticRoutes?: StaticRoute[];
	errorHandler?: ErrorHandler;
	options?: {
		watch?: boolean;
	};
}

export interface NodeServerAdapterResult extends ServerAdapterResult {
	completeInitialization: (server: NodeServerInstance) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
}

export class NodeServerAdapter extends SharedServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private serverInstance: NodeServerInstance | null = null;
	private initialized = false;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorHandler?: ErrorHandler;
	private previewServer: NodeStaticContentServer | null = null;
	private bridge: NodeClientBridge | null = null;
	private hmrManager: NodeHmrManager | null = null;
	private processorBuildPlugins: EcoBuildPlugin[] = [];

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
	}

	public async initialize(): Promise<void> {
		this.setupLoaders();
		this.copyPublicDir();
		await this.initializePlugins();
		await this.initSharedRouter();
		this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager ?? undefined);
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.staticBuilder = new ServerStaticBuilder({
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
		});
		this.initialized = true;
	}

	private setupLoaders(): void {
		for (const loader of this.appConfig.loaders.values()) {
			defaultBuildAdapter.registerPlugin(loader);
		}
	}

	private copyPublicDir(): void {
		const srcPublicDir = path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir);

		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, path.join(this.appConfig.rootDir, this.appConfig.distDir));
		}

		fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
	}

	private async initializePlugins(): Promise<void> {
		const processorBuildPlugins: EcoBuildPlugin[] = [];

		for (const processor of this.appConfig.processors.values()) {
			await processor.setup();

			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					defaultBuildAdapter.registerPlugin(plugin);
				}
			}
			if (processor.buildPlugins) {
				processorBuildPlugins.push(...processor.buildPlugins);
				for (const plugin of processor.buildPlugins) {
					defaultBuildAdapter.registerPlugin(plugin);
				}
			}
		}

		for (const integration of this.appConfig.integrations) {
			integration.setConfig(this.appConfig);
			integration.setRuntimeOrigin(this.runtimeOrigin);
			if (this.hmrManager) {
				integration.setHmrManager(this.hmrManager);
			}
			await integration.setup();

			for (const plugin of integration.plugins) {
				defaultBuildAdapter.registerPlugin(plugin);
			}
		}

		this.processorBuildPlugins = processorBuildPlugins;
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public async buildStatic(options?: { preview?: boolean }): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}

		const buildServer = await this.startBuildRuntimeServer();

		try {
			await this.staticBuilder.build(
				{ preview: false },
				{
					router: this.router,
					routeRendererFactory: this.routeRendererFactory,
					staticRoutes: this.staticRoutes,
				},
			);
		} finally {
			await this.stopBuildRuntimeServer(buildServer);
		}

		if (!options?.preview) {
			return;
		}

		if (this.previewServer) {
			await this.previewServer.stop();
		}

		this.previewServer = new NodeStaticContentServer({
			appConfig: this.appConfig,
			options: {
				hostname: this.serveOptions.hostname,
				port: Number(this.serveOptions.port || 3000),
			},
		});

		await this.previewServer.start();
		const previewHostname = this.serveOptions.hostname || 'localhost';
		const previewPort = this.serveOptions.port || 3000;
		appLogger.info(`Preview running at http://${previewHostname}:${previewPort}`);
	}

	private createWebRequest(req: IncomingMessage): Request {
		const url = new URL(req.url ?? '/', this.runtimeOrigin);
		const headers = new Headers();

		for (const [key, value] of Object.entries(req.headers)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					headers.append(key, item);
				}
				continue;
			}

			if (value !== undefined) {
				headers.set(key, value);
			}
		}

		const method = (req.method ?? 'GET').toUpperCase();
		const requestInit: RequestInit & { duplex?: 'half' } = {
			method,
			headers,
		};

		if (method !== 'GET' && method !== 'HEAD') {
			requestInit.body = req as unknown as BodyInit;
			requestInit.duplex = 'half';
		}

		return new Request(url, requestInit);
	}

	private async sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
		res.statusCode = response.status;

		response.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});

		if (!response.body) {
			res.end();
			return;
		}

		const body = Buffer.from(await response.arrayBuffer());
		res.end(body);
	}

	private async startBuildRuntimeServer(): Promise<NodeHttpServer> {
		const hostname = String(this.serveOptions.hostname || 'localhost');
		const port = Number(this.serveOptions.port || 3000);

		const server = createServer(async (req, res) => {
			try {
				const webRequest = this.createWebRequest(req);
				const response = await this.handleRequest(webRequest);
				await this.sendNodeResponse(res, response);
			} catch (error) {
				appLogger.error('Node static build runtime request failed', error as Error);
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		});

		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, hostname, () => {
				server.off('error', reject);
				resolve();
			});
		});

		this.serverInstance = server;
		appLogger.info(`Server running at http://${hostname}:${port}`);

		return server;
	}

	private async stopBuildRuntimeServer(server: NodeHttpServer): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
			server.closeAllConnections();
		});

		if (this.serverInstance === server) {
			this.serverInstance = null;
		}
	}

	public async createAdapter(): Promise<NodeServerAdapterResult> {
		await this.initialize();

		return {
			getServerOptions: this.getServerOptions.bind(this),
			buildStatic: this.buildStatic.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
			handleRequest: this.handleRequest.bind(this),
		};
	}

	public async handleRequest(_request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		return this.handleSharedRequest(_request, {
			apiHandlers: this.apiHandlers,
			errorHandler: this.errorHandler,
			serverInstance: this.serverInstance,
			hmrManager: this.hmrManager,
		});
	}

	public async completeInitialization(_server: NodeServerInstance): Promise<void> {
		this.serverInstance = _server;

		if (this.options?.watch) {
			const { WebSocketServer } = await import('ws');
			const wss = new WebSocketServer({ noServer: true });
			this.bridge = new NodeClientBridge();
			this.hmrManager = new NodeHmrManager({ appConfig: this.appConfig, bridge: this.bridge });
			this.hmrManager.setEnabled(true);

			await this.hmrManager.buildRuntime();

			_server.on('upgrade', (req, socket, head) => {
				const url = new URL(req.url ?? '/', this.runtimeOrigin);
				if (url.pathname === '/_hmr') {
					wss.handleUpgrade(req, socket, head, (ws) => {
						this.bridge!.subscribe(ws);
						ws.on('close', () => this.bridge!.unsubscribe(ws));
						ws.on('error', (err) => appLogger.error('[HMR] WebSocket error:', err));
					});
				} else {
					socket.destroy();
				}
			});

			const loaderPlugins = Array.from(this.appConfig.loaders.values());
			const hmrBuildPlugins = [...loaderPlugins, ...this.processorBuildPlugins];
			this.hmrManager.setPlugins(hmrBuildPlugins);

			for (const integration of this.appConfig.integrations) {
				integration.setHmrManager(this.hmrManager);
			}

			this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager);

			const watcher = new ProjectWatcher({
				config: this.appConfig,
				refreshRouterRoutesCallback: async () => {
					await this.initSharedRouter();
					this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager);
				},
				hmrManager: this.hmrManager,
				bridge: this.bridge,
			});
			await watcher.createWatcherSubscription();
		}

		appLogger.debug('Node server adapter initialization completed', {
			apiHandlers: this.apiHandlers.length,
			staticRoutes: this.staticRoutes.length,
			hasErrorHandler: !!this.errorHandler,
			hmrEnabled: !!this.hmrManager?.isEnabled(),
		});
	}
}

export async function createNodeServerAdapter(params: NodeServerAdapterParams): Promise<NodeServerAdapterResult> {
	const runtimeOrigin =
		params.runtimeOrigin ??
		`http://${params.serveOptions.hostname || 'localhost'}:${params.serveOptions.port || 3000}`;

	const adapter = new NodeServerAdapter({
		...params,
		runtimeOrigin,
	});

	return adapter.createAdapter();
}
