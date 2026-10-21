import type {
	ApiHandler,
	ApiHandlerContext,
	MiddlewareContext,
	MiddlewareList,
	RenderOptions,
	RouteHandlerContext,
	RouteSchema,
} from '../../../types/contracts.ts';
import { createBodyResponse } from './create-body-response.ts';

type UniversalContext = ApiHandlerContext<Request, unknown>;

type DefineApiHandlerInput<
	TPath extends string,
	TSchema extends RouteSchema,
	TContext extends UniversalContext,
	TMiddleware extends MiddlewareList<Request, unknown>,
> = Omit<ApiHandler<TPath, Request, unknown>, 'handler' | 'middleware' | 'schema' | 'method' | 'path'> & {
	handler: (
		context: RouteHandlerContext<TSchema, TContext & MiddlewareContext<TMiddleware>>,
	) => Promise<Response> | Response;
	middleware?: TMiddleware;
	schema?: TSchema;
};

/**
 * A define helper bound to one HTTP method.
 *
 * @typeParam TContext - The context the handler starts from: the base context, or the group's
 * @typeParam TPathOptional - Whether `path` may be omitted, as an endpoint file export omits it
 *
 * @remarks
 * Without `path` the returned `path` is `''`, which `app.add` and `app.group` reject.
 */
type DefineApiMethod<TContext extends UniversalContext, TPathOptional extends boolean = false> = <
	const TPath extends string = '',
	TSchema extends RouteSchema = RouteSchema,
	THandlerContext extends TContext = TContext,
	const TMiddleware extends MiddlewareList<Request, unknown> = MiddlewareList<Request, unknown>,
>(
	handler: DefineApiHandlerInput<TPath, TSchema, THandlerContext, TMiddleware> &
		(TPathOptional extends true ? { path?: TPath } : { path: TPath }),
) => ApiHandler<TPath, Request, unknown>;

export function defineApiHandler<
	TPath extends string,
	TSchema extends RouteSchema = RouteSchema,
	TContext extends UniversalContext = UniversalContext,
	const TMiddleware extends MiddlewareList<Request, unknown> = MiddlewareList<Request, unknown>,
>(
	handler: DefineApiHandlerInput<TPath, TSchema, TContext, TMiddleware> & {
		path: TPath;
		method: ApiHandler<TPath, Request, unknown>['method'];
	},
): ApiHandler<TPath, Request, unknown> {
	return handler as ApiHandler<TPath, Request, unknown>;
}

function defineApiMethod<TContext extends UniversalContext, TPathOptional extends boolean = false>(
	method: ApiHandler['method'],
): DefineApiMethod<TContext, TPathOptional> {
	return ((handler: Omit<ApiHandler<string, Request, unknown>, 'method' | 'path'> & { path?: string }) => ({
		...handler,
		path: handler.path ?? '',
		method,
	})) as DefineApiMethod<TContext, TPathOptional>;
}

/** The method helper an endpoint file exports from: `path` may be omitted. */
type EndpointMethod = DefineApiMethod<UniversalContext, true>;

export const defineGet: EndpointMethod = defineApiMethod<UniversalContext, true>('GET');
export const definePost: EndpointMethod = defineApiMethod<UniversalContext, true>('POST');
export const definePut: EndpointMethod = defineApiMethod<UniversalContext, true>('PUT');
export const defineDelete: EndpointMethod = defineApiMethod<UniversalContext, true>('DELETE');
export const definePatch: EndpointMethod = defineApiMethod<UniversalContext, true>('PATCH');
export const defineOptions: EndpointMethod = defineApiMethod<UniversalContext, true>('OPTIONS');
export const defineHead: EndpointMethod = defineApiMethod<UniversalContext, true>('HEAD');
/** Defines a handler for the QUERY method, a safe, idempotent read whose request body carries the query. */
export const defineQuery: EndpointMethod = defineApiMethod<UniversalContext, true>('QUERY');

export function json(data: unknown, options?: RenderOptions): Response {
	return createBodyResponse('json', data, {
		status: options?.status,
		headers: options?.headers,
	});
}

export function html(content: string, options?: RenderOptions): Response {
	return createBodyResponse('html', content, {
		status: options?.status,
		headers: options?.headers,
	});
}

export function redirect(url: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: { Location: url },
	});
}

export interface GroupHandler<TPrefix extends string = string> {
	prefix: TPrefix;
	middleware?: MiddlewareList<Request, unknown>;
	routes: readonly ApiHandler<string, Request, unknown>[];
}

type GroupDefineHandler<TContext extends UniversalContext> = {
	<
		const TPath extends string,
		TSchema extends RouteSchema = RouteSchema,
		const TMiddleware extends MiddlewareList<Request, unknown> = MiddlewareList<Request, unknown>,
	>(
		handler: DefineApiHandlerInput<TPath, TSchema, TContext, TMiddleware> & {
			path: TPath;
			method: ApiHandler<TPath, Request, unknown>['method'];
		},
	): ApiHandler<TPath, Request, unknown>;
} & { [M in ApiHandler['method'] as Lowercase<M>]: DefineApiMethod<TContext> };

function createGroupApi<TContext extends UniversalContext>(): GroupDefineHandler<TContext> {
	const define = ((handler: ApiHandler<string, Request, unknown>) => handler) as GroupDefineHandler<TContext>;
	return Object.assign(define, {
		get: defineApiMethod<TContext>('GET'),
		post: defineApiMethod<TContext>('POST'),
		put: defineApiMethod<TContext>('PUT'),
		delete: defineApiMethod<TContext>('DELETE'),
		patch: defineApiMethod<TContext>('PATCH'),
		options: defineApiMethod<TContext>('OPTIONS'),
		head: defineApiMethod<TContext>('HEAD'),
		query: defineApiMethod<TContext>('QUERY'),
	});
}

export function defineGroupHandler<
	TPrefix extends string,
	const TMiddleware extends MiddlewareList<Request, unknown> = [],
	TContext extends UniversalContext = UniversalContext & MiddlewareContext<TMiddleware>,
>(config: {
	prefix: TPrefix;
	middleware?: TMiddleware;
	routes: (api: GroupDefineHandler<TContext>) => readonly ApiHandler<string, Request, unknown>[];
}): GroupHandler<TPrefix> {
	return {
		prefix: config.prefix,
		middleware: config.middleware,
		routes: config.routes(createGroupApi<TContext>()),
	};
}
