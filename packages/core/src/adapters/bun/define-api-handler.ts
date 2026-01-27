import type { BunRequest, Server } from 'bun';
import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	RouteSchema,
	TypedGroupHandlerContext,
} from '../../public-types';

type BunSchemaHandlerContext<
	TSchema extends RouteSchema | undefined,
	TPath extends string,
	WebSocketData,
	TContext extends ApiHandlerContext<BunRequest<TPath>, Server<WebSocketData>>,
> = TSchema extends RouteSchema ? TypedGroupHandlerContext<TSchema, TContext, BunRequest<TPath>> : TContext;

/**
 * Helper function specifically for Bun to define an API handler with
 * automatically inferred path type for BunRequest.
 *
 * @template TPath The literal string type of the path, inferred from the 'path' property.
 * @param handler The API handler configuration object using BunRequest.
 * @returns The same handler object, strongly typed for Bun.
 */
export function defineApiHandler<
	TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
	WebSocketData = undefined,
	TContext extends ApiHandlerContext<BunRequest<TPath>, Server<WebSocketData>> = ApiHandlerContext<
		BunRequest<TPath>,
		Server<WebSocketData>
	>,
>(
	handler: Omit<ApiHandler<TPath, BunRequest<TPath>, Server<WebSocketData>>, 'handler' | 'middleware' | 'schema'> & {
		handler: (
			context: BunSchemaHandlerContext<TSchema, TPath, WebSocketData, TContext>,
		) => Promise<Response> | Response;
		middleware?: Middleware<BunRequest<TPath>, Server<WebSocketData>, TContext>[];
		schema?: TSchema;
	},
): ApiHandler<TPath, BunRequest<TPath>, Server<WebSocketData>> {
	return handler as ApiHandler<TPath, BunRequest<TPath>, Server<WebSocketData>>;
}

/**
 * Configuration for a group of related API handlers with shared prefix and middleware.
 */
export interface GroupHandler<TPrefix extends string = string, WebSocketData = undefined> {
	prefix: TPrefix;
	middleware?: readonly Middleware<BunRequest<string>, Server<WebSocketData>, any>[];
	routes: readonly ApiHandler<any, any, Server<WebSocketData>>[];
}

type GroupDefineHandler<
	WebSocketData,
	TContext extends ApiHandlerContext<BunRequest<string>, Server<WebSocketData>>,
> = <const TPath extends string, TSchema extends RouteSchema | undefined = undefined>(
	handler: Omit<ApiHandler<TPath, BunRequest<TPath>, Server<WebSocketData>>, 'handler' | 'middleware' | 'schema'> & {
		path: TPath;
		handler: (
			context: TSchema extends RouteSchema
				? TypedGroupHandlerContext<TSchema, TContext, BunRequest<TPath>>
				: Omit<TContext, 'request'> & { request: BunRequest<TPath> },
		) => Promise<Response> | Response;
		middleware?: Middleware<BunRequest<string>, Server<WebSocketData>, TContext>[];
		schema?: TSchema;
	},
) => ApiHandler<TPath, BunRequest<TPath>, Server<WebSocketData>>;

/**
 * Helper function to define a group of API handlers with shared prefix and middleware.
 * The group middleware context is inferred and passed to all route handlers.
 *
 * @example
 * ```typescript
 * const adminGroup = defineGroupHandler({
 *   prefix: '/admin',
 *   middleware: [authMiddleware],
 *   routes: (define) => [
 *     define({ path: '/', method: 'GET', handler: (ctx) => ctx.render(List, {}) }),
 *     define({ path: '/posts/:id', method: 'GET', handler: (ctx) => {
 *       // ctx.session is typed from authMiddleware!
 *       // ctx.request.params.id is typed from path!
 *       return ctx.render(Post, { id: ctx.request.params.id });
 *     }}),
 *   ],
 * });
 *
 * app.registerGroup(adminGroup);
 * ```
 */
export function defineGroupHandler<
	TPrefix extends string,
	WebSocketData = undefined,
	TMiddleware extends readonly Middleware<BunRequest<string>, Server<WebSocketData>, any>[] = [],
	TContext extends ApiHandlerContext<BunRequest<string>, Server<WebSocketData>> =
		TMiddleware extends readonly Middleware<BunRequest<string>, Server<WebSocketData>, infer TGroupContext>[]
			? TGroupContext
			: ApiHandlerContext<BunRequest<string>, Server<WebSocketData>>,
>(config: {
	prefix: TPrefix;
	middleware?: TMiddleware;
	routes: (
		define: GroupDefineHandler<WebSocketData, TContext>,
	) => readonly ApiHandler<any, any, Server<WebSocketData>>[];
}): GroupHandler<TPrefix, WebSocketData> {
	const define: GroupDefineHandler<WebSocketData, TContext> = (handler) => {
		return handler as ApiHandler<any, any, Server<WebSocketData>>;
	};

	return {
		prefix: config.prefix,
		middleware: config.middleware,
		routes: config.routes(define),
	};
}
