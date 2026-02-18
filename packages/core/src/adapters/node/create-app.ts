import type { Server as NodeServerInstance } from 'node:http';
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

export interface NodeEcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
}

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

export class NodeEcopagesApp extends AbstractApplicationAdapter<NodeEcopagesAppOptions, NodeServerInstance, Request> {
	serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private runtimeOrigin = '';

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
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		const { build, preview } = this.cliArgs;

		if (build || preview) {
			await this.serverAdapter.buildStatic({ preview });
			return;
		}

		appLogger.warn('NodeEcopagesApp scaffold is initialized, but runtime server start is not implemented yet');
		return this.server ?? undefined;
	}

	public async request(request: string | Request): Promise<Response> {
		if (!this.runtimeOrigin) {
			throw new Error('Node app is not initialized. Call start() first.');
		}

		const url = typeof request === 'string' ? `${this.runtimeOrigin}${request}` : request;
		return fetch(url);
	}
}

export async function createNodeApp(options: NodeEcopagesAppOptions): Promise<NodeEcopagesApp> {
	return new NodeEcopagesApp(options);
}
