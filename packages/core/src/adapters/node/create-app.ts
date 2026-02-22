import { createServer, type IncomingMessage, type Server as NodeServerInstance, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
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

/**
 * Builder API used by `group('/prefix', callback)` in the Node adapter.
 */
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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
			options as RouteOptions<Request, NodeServerInstance, ApiHandlerContext<Request, NodeServerInstance>> | undefined,
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

	add(handler: ApiHandler<string, Request, NodeServerInstance>): this {
		return this.register(
			handler.path,
			handler.method,
			handler.handler as RouteHandler<Request, NodeServerInstance>,
			handler.middleware || handler.schema
				? {
					middleware: handler.middleware as Middleware<Request, NodeServerInstance, any>[] | undefined,
					schema: handler.schema,
				}
				: undefined,
		);
	}

	/**
	 * Create a route group with shared prefix and middleware.
	 *
	 * Supports either:
	 * - builder form: `group('/prefix', (builder) => { ... })`
	 * - pre-built object form: `group(groupHandler)`
	 */

	group(
		prefixOrGroup:
			| string
			| {
					prefix: string;
					middleware?: readonly Middleware<Request, NodeServerInstance, any>[];
					routes: readonly ApiHandler<string, Request, NodeServerInstance>[];
			  },
		callback?: (builder: NodeRouteGroupBuilder) => void,
		options?: {
			middleware?: readonly Middleware<Request, NodeServerInstance, any>[];
		},
	): this {
		if (typeof prefixOrGroup === 'object') {
			return this.registerGroup(prefixOrGroup);
		}

		const normalizedPrefix = prefixOrGroup.endsWith('/') ? prefixOrGroup.slice(0, -1) : prefixOrGroup;
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

		callback!(builder);
		return this;
	}

	private registerGroup(group: {
		prefix: string;
		middleware?: readonly Middleware<Request, NodeServerInstance, any>[];
		routes: readonly ApiHandler<string, Request, NodeServerInstance>[];
	}): this {
		const normalizedPrefix = group.prefix.endsWith('/') ? group.prefix.slice(0, -1) : group.prefix;
		const groupMiddleware = group.middleware ?? [];

		for (const route of group.routes) {
			const normalizedPath = route.path.startsWith('/') ? route.path : `/${route.path}`;
			const fullPath = route.path === '/' ? normalizedPrefix : `${normalizedPrefix}${normalizedPath}`;
			const combinedMiddleware = [...groupMiddleware, ...(route.middleware ?? [])];

			this.addRouteHandler(
				fullPath,
				route.method,
				route.handler as RouteHandler<Request, NodeServerInstance>,
				combinedMiddleware.length > 0
					? (combinedMiddleware as Middleware<Request, NodeServerInstance, any>[])
					: undefined,
				route.schema,
			);
		}

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
