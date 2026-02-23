import type { Server } from 'bun';
import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	RouteSchema,
	TypedGroupHandlerContext,
} from '../../public-types';

type BunSchemaHandlerContext<
	TSchema extends RouteSchema | undefined,
	WebSocketData,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>>,
> = TSchema extends RouteSchema ? TypedGroupHandlerContext<TSchema, TContext> : TContext;

/**
 * Helper function specifically for Bun to define an API handler with
 * automatically inferred path type for BunRequest.
 *
 * This returns a self-describing route declaration (`path`, `method`, `handler`,
 * optional `middleware`, optional `schema`) that can be registered on the app.
 *
 * @template TPath The literal string type of the path, inferred from the 'path' property.
 * @param handler The API handler configuration object using BunRequest.
 * @returns The same handler object, strongly typed for Bun.
 */
export function defineApiHandler<
	TSchema extends RouteSchema | undefined = undefined,
	WebSocketData = undefined,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
>(
	handler: Omit<ApiHandler<string, Request, Server<WebSocketData>>, 'handler' | 'middleware' | 'schema'> & {
		handler: (context: BunSchemaHandlerContext<TSchema, WebSocketData, TContext>) => Promise<Response> | Response;
		middleware?: Middleware<Request, Server<WebSocketData>, TContext>[];
		schema?: TSchema;
	},
): ApiHandler<string, Request, Server<WebSocketData>> {
	return handler as ApiHandler<string, Request, Server<WebSocketData>>;
}

/**
 * Configuration for a group of related API handlers with shared prefix and middleware.
 */
export interface GroupHandler<TPrefix extends string = string, WebSocketData = undefined> {
	prefix: TPrefix;
	middleware?: readonly Middleware<Request, Server<WebSocketData>, any>[];
	routes: readonly ApiHandler<string, Request, Server<WebSocketData>>[];
}

type GroupDefineHandler<WebSocketData, TContext extends ApiHandlerContext<Request, Server<WebSocketData>>> = <
	const TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
>(
	handler: Omit<ApiHandler<TPath, Request, Server<WebSocketData>>, 'handler' | 'middleware' | 'schema'> & {
		path: TPath;
		handler: (
			context: TSchema extends RouteSchema ? TypedGroupHandlerContext<TSchema, TContext> : TContext,
		) => Promise<Response> | Response;
		middleware?: Middleware<Request, Server<WebSocketData>, TContext>[];
		schema?: TSchema;
	},
) => ApiHandler<TPath, Request, Server<WebSocketData>>;

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
 *       // ctx.params.id is typed from path!
 *       return ctx.render(Post, { id: ctx.params.id });
 *     }}),
 *   ],
 * });
 *
 * app.group(adminGroup);
 * ```
 */
export function defineGroupHandler<
	TPrefix extends string,
	WebSocketData = undefined,
	TMiddleware extends readonly Middleware<Request, Server<WebSocketData>, any>[] = [],
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = TMiddleware extends readonly Middleware<
		Request,
		Server<WebSocketData>,
		infer TGroupContext
	>[]
		? TGroupContext
		: ApiHandlerContext<Request, Server<WebSocketData>>,
>(config: {
	prefix: TPrefix;
	middleware?: TMiddleware;
	routes: (
		define: GroupDefineHandler<WebSocketData, TContext>,
	) => readonly ApiHandler<string, Request, Server<WebSocketData>>[];
}): GroupHandler<TPrefix, WebSocketData> {
	const define = ((handler) => handler) as GroupDefineHandler<WebSocketData, TContext>;

	return {
		prefix: config.prefix,
		middleware: config.middleware,
		routes: config.routes(define),
	};
}
