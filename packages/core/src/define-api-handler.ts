import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	RouteSchema,
	TypedGroupHandlerContext,
} from './public-types.ts';

type UniversalContext = ApiHandlerContext<Request, unknown>;

type SchemaHandlerContext<TSchema extends RouteSchema | undefined, TContext extends UniversalContext> =
	TSchema extends RouteSchema ? TypedGroupHandlerContext<TSchema, TContext> : TContext;

export function defineApiHandler<
	TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
	TContext extends UniversalContext = UniversalContext,
>(
	handler: Omit<ApiHandler<TPath, Request, unknown>, 'handler' | 'middleware' | 'schema'> & {
		handler: (context: SchemaHandlerContext<TSchema, TContext>) => Promise<Response> | Response;
		middleware?: Middleware<Request, unknown, TContext>[];
		schema?: TSchema;
	},
): ApiHandler<TPath, Request, unknown> {
	return handler as ApiHandler<TPath, Request, unknown>;
}

export interface GroupHandler<TPrefix extends string = string> {
	prefix: TPrefix;
	middleware?: readonly Middleware<Request, unknown, any>[];
	routes: readonly ApiHandler<string, Request, unknown>[];
}

type GroupDefineHandler<TContext extends UniversalContext> = <
	const TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
>(
	handler: Omit<ApiHandler<TPath, Request, unknown>, 'handler' | 'middleware' | 'schema'> & {
		path: TPath;
		handler: (context: SchemaHandlerContext<TSchema, TContext>) => Promise<Response> | Response;
		middleware?: Middleware<Request, unknown, TContext>[];
		schema?: TSchema;
	},
) => ApiHandler<TPath, Request, unknown>;

export function defineGroupHandler<
	TPrefix extends string,
	TMiddleware extends readonly Middleware<Request, unknown, any>[] = [],
	TContext extends UniversalContext = TMiddleware extends readonly Middleware<Request, unknown, infer TGroupContext>[]
		? TGroupContext
		: UniversalContext,
>(config: {
	prefix: TPrefix;
	middleware?: TMiddleware;
	routes: (define: GroupDefineHandler<TContext>) => readonly ApiHandler<string, Request, unknown>[];
}): GroupHandler<TPrefix> {
	const define = ((handler) => handler) as GroupDefineHandler<TContext>;

	return {
		prefix: config.prefix,
		middleware: config.middleware,
		routes: config.routes(define),
	};
}