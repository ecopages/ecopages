import { createServer, type IncomingMessage, type Server as NodeServerInstance, type ServerResponse } from 'node:http';
import { register } from 'node:module';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, ApiHandlerContext, Middleware, RouteOptions, StaticRoute } from '../../public-types.ts';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteHandler,
} from '../abstract/application-adapter.ts';
import { type NodeServerAdapterResult, createNodeServerAdapter } from './server-adapter.ts';
import { registerNodeRuntimePlugins } from './node-runtime-plugin-adapter.ts';

export type NodeMiddleware<TExtension extends Record<string, any> = {}> = Middleware<
	Request,
	NodeServerInstance,
	ApiHandlerContext<Request, NodeServerInstance> & TExtension
>;

export type NodeHandlerContext<TExtension extends Record<string, any> = {}> = ApiHandlerContext<
	Request,
	NodeServerInstance
> &
	TExtension;

export interface EcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
}

export type NodeEcopagesAppOptions = EcopagesAppOptions;

interface NodeRouteGroupBuilder {
	get(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	post(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	put(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	delete(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	patch(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	options(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
	head(
		path: string,
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): NodeRouteGroupBuilder;
}

export class EcopagesApp extends AbstractApplicationAdapter<EcopagesAppOptions, NodeServerInstance, Request> {
	serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private runtimeOrigin = '';
	private static nodeRuntimeLoaderRegistered = false;

	private registerNodeCssProcessingBridge() {
		type NodeCssBridge = (args: { filePath: string; contents: string }) => Promise<string>;
		type NodeProcessWithCssBridge = NodeJS.Process & {
			__ECOPAGES_NODE_PROCESS_CSS__?: NodeCssBridge;
		};

		const processWithBridge = process as NodeProcessWithCssBridge;
		const processors = Array.from(this.appConfig.processors.values()) as Array<{
			cssProcessor?: (contents: string, filePath: string) => Promise<string>;
			nodeCssProcessor?: (contents: string, filePath: string) => Promise<string>;
			processForNodeRuntime?: (contents: string, filePath: string) => Promise<string>;
		}>;

		const cssProcessor = processors
			.map((processor) => processor.cssProcessor ?? processor.nodeCssProcessor ?? processor.processForNodeRuntime)
			.find(
				(processor): processor is (contents: string, filePath: string) => Promise<string> =>
					typeof processor === 'function',
			);

		if (!cssProcessor) {
			delete processWithBridge.__ECOPAGES_NODE_PROCESS_CSS__;
			return;
		}

		processWithBridge.__ECOPAGES_NODE_PROCESS_CSS__ = async ({ filePath, contents }) => {
			return await cssProcessor(contents, filePath);
		};
	}

	private ensureNodeRuntimeLoaderRegistration() {
		if (EcopagesApp.nodeRuntimeLoaderRegistered) {
			return;
		}

		process.env.ECOPAGES_APP_ROOT = this.appConfig.rootDir;
		process.env.ECOPAGES_SRC_DIR = this.appConfig.absolutePaths.srcDir;
		process.env.ECOPAGES_DIST_DIR = this.appConfig.absolutePaths.distDir;
		process.env.ECOPAGES_JSX_IMPORT_SOURCE = process.env.ECOPAGES_JSX_IMPORT_SOURCE ?? '@kitajs/html';

		register(new URL('./node-runtime-loader.mjs', import.meta.url), pathToFileURL(`${this.appConfig.rootDir}/`));
		EcopagesApp.nodeRuntimeLoaderRegistered = true;
	}

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

	private register(
		path: string,
		method: ApiHandler['method'],
		handler: RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
		options?: RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
	): this {
		return this.addRouteHandler(path, method, handler, options?.middleware, options?.schema);
	}

	get<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'GET',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	post<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'POST',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	put<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'PUT',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	delete<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'DELETE',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	patch<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'PATCH',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	options<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'OPTIONS',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	head<
		P extends string,
		TContext extends ApiHandlerContext<Request, NodeServerInstance> = ApiHandlerContext<
			Request,
			NodeServerInstance
		>,
	>(
		path: P,
		handler: RouteHandler<Request, NodeServerInstance, TContext>,
		options?: RouteOptions<Request, NodeServerInstance, TContext>,
	): this {
		return this.register(
			path,
			'HEAD',
			handler as RouteHandler<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>,
			options as
				| RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>>
				| undefined,
		);
	}

	route(
		path: string,
		method: ApiHandler['method'],
		handler: RouteHandler<Request, NodeServerInstance>,
		options?: RouteOptions<Request, NodeServerInstance>,
	): this {
		return this.register(path, method, handler, options);
	}

	group(
		prefix: string,
		callback: (builder: NodeRouteGroupBuilder) => void,
		options?: {
			middleware?: readonly Middleware<Request, NodeServerInstance, any>[];
		},
	): this {
		const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
		const groupMiddleware = options?.middleware ?? [];

		const createHandler = (method: ApiHandler['method']) => {
			return (
				path: string,
				handler: RouteHandler<Request, NodeServerInstance>,
				routeOptions?: RouteOptions<Request, NodeServerInstance>,
			) => {
				const fullPath = path === '/' ? normalizedPrefix : `${normalizedPrefix}${path}`;
				const middleware = [...groupMiddleware, ...(routeOptions?.middleware ?? [])];
				this.addRouteHandler(
					fullPath,
					method,
					handler,
					middleware.length > 0 ? middleware : undefined,
					routeOptions?.schema,
				);
				return builder;
			};
		};

		const builder: NodeRouteGroupBuilder = {
			get: createHandler('GET'),
			post: createHandler('POST'),
			put: createHandler('PUT'),
			delete: createHandler('DELETE'),
			patch: createHandler('PATCH'),
			options: createHandler('OPTIONS'),
			head: createHandler('HEAD'),
		};

		callback(builder);
		return this;
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
		await registerNodeRuntimePlugins(this.appConfig);
		this.ensureNodeRuntimeLoaderRegistration();

		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		this.registerNodeCssProcessingBridge();

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

	public async request(request: string | Request): Promise<Response> {
		if (!this.runtimeOrigin) {
			throw new Error('Node app is not initialized. Call start() first.');
		}

		const url = typeof request === 'string' ? `${this.runtimeOrigin}${request}` : request;
		return fetch(url);
	}
}

export async function createNodeApp(options: EcopagesAppOptions): Promise<EcopagesApp> {
	return new EcopagesApp(options);
}

export { EcopagesApp as NodeEcopagesApp };
