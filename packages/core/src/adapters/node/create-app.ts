import { createServer, type IncomingMessage, type Server as NodeServerInstance, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { StaticRoute } from '../../types/public-types.ts';
import { type ApplicationAdapterOptions } from '../abstract/application-adapter.ts';
import { SharedApplicationAdapter } from '../shared/application-adapter.ts';
import { type NodeServerAdapterResult, createNodeServerAdapter } from './server-adapter.ts';

export interface EcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
}

export class EcopagesApp extends SharedApplicationAdapter<EcopagesAppOptions, NodeServerInstance, Request> {
	serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private runtimeOrigin = '';

	public async stop(force = true): Promise<void> {
		if (!this.server) {
			return;
		}

		const activeServer = this.server;
		this.server = null;

		await new Promise<void>((resolve, reject) => {
			activeServer.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});

			if (force) {
				activeServer.closeAllConnections();
			}
		});
	}

	protected async initializeServerAdapter(): Promise<NodeServerAdapterResult> {
		const { dev } = this.cliArgs;
		const { port: cliPort, hostname: cliHostname } = this.cliArgs;

		const envPort = process.env.ECOPAGES_PORT;
		const envHostname = process.env.ECOPAGES_HOSTNAME;

		const preferredPort = cliPort ?? (envPort ? Number(envPort) : undefined) ?? DEFAULT_ECOPAGES_PORT;
		const preferredHostname = cliHostname ?? envHostname ?? DEFAULT_ECOPAGES_HOSTNAME;
		this.runtimeOrigin = `http://${preferredHostname}:${preferredPort}`;

		return createNodeServerAdapter({
			runtimeOrigin: this.runtimeOrigin,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes as StaticRoute[],
			errorHandler: this.errorHandler,
			options: { watch: dev },
			serveOptions: {
				port: preferredPort,
				hostname: preferredHostname,
				...this.serverOptions,
			},
		});
	}

	public async start(): Promise<NodeServerInstance | void> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		if (this.server) {
			return this.server;
		}

		const { build, preview } = this.cliArgs;

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			await this.serverAdapter.buildStatic({ preview });
			await this.stop(true);
			appLogger.debugTimeEnd('Building static pages');

			if (build) {
				process.exit(0);
			}
			return;
		}

		const serveOptions = this.serverAdapter.getServerOptions();
		const hostname = String(serveOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME);
		const port = Number(serveOptions.port ?? DEFAULT_ECOPAGES_PORT);
		this.runtimeOrigin = `http://${hostname}:${port}`;

		this.server = createServer(async (req, res) => {
			try {
				const webRequest = this.createWebRequest(req);
				const response = await this.serverAdapter!.handleRequest(webRequest);
				await this.sendNodeResponse(res, response);
			} catch (error) {
				appLogger.error('Node server adapter request failed', error as Error);
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		});

		await new Promise<void>((resolve) => {
			this.server!.listen(port, hostname, () => resolve());
		});

		await this.serverAdapter.completeInitialization(this.server);
		appLogger.info(`Node server running at ${this.runtimeOrigin}`);

		return this.server;
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
			requestInit.body = Readable.toWeb(req) as unknown as BodyInit;
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

	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		return this.serverAdapter.handleRequest(request);
	}
}

export async function createNodeApp(options: EcopagesAppOptions): Promise<EcopagesApp> {
	return new EcopagesApp(options);
}
