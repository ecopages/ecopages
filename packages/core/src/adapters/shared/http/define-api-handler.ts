import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	RenderOptions,
	RouteSchema,
	TypedGroupHandlerContext,
} from '../../../types/contracts.ts';
import { createBodyResponse } from './create-body-response.ts';

type UniversalContext = ApiHandlerContext<Request, unknown>;

type SchemaHandlerContext<
	TSchema extends RouteSchema | undefined,
	TContext extends UniversalContext,
> = TSchema extends RouteSchema ? TypedGroupHandlerContext<TSchema, TContext> : TContext;

type DefineApiHandlerInput<
	TPath extends string,
	TSchema extends RouteSchema | undefined,
	TContext extends UniversalContext,
> = Omit<ApiHandler<TPath, Request, unknown>, 'handler' | 'middleware' | 'schema' | 'method'> & {
	handler: (context: SchemaHandlerContext<TSchema, TContext>) => Promise<Response> | Response;
	middleware?: Middleware<Request, unknown, TContext>[];
	schema?: TSchema;
};

export function defineApiHandler<
	TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
	TContext extends UniversalContext = UniversalContext,
>(
	handler: DefineApiHandlerInput<TPath, TSchema, TContext> & {
		method: ApiHandler<TPath, Request, unknown>['method'];
	},
): ApiHandler<TPath, Request, unknown> {
	return handler as ApiHandler<TPath, Request, unknown>;
}

function defineApiMethod<M extends ApiHandler['method']>(method: M) {
	function define<
		const TPath extends string,
		TSchema extends RouteSchema | undefined = undefined,
		TContext extends UniversalContext = UniversalContext,
	>(handler: DefineApiHandlerInput<TPath, TSchema, TContext>): ApiHandler<TPath, Request, unknown>;
	/**
	 * Defines the handler exported by an endpoint file, whose Template Route gives the URL.
	 *
	 * @remarks
	 * The returned `path` is `''`, which `app.add` and `app.group` reject.
	 */
	function define<
		TSchema extends RouteSchema | undefined = undefined,
		TContext extends UniversalContext = UniversalContext,
	>(handler: Omit<DefineApiHandlerInput<'', TSchema, TContext>, 'path'>): ApiHandler<'', Request, unknown>;
	function define(
		handler: Omit<ApiHandler<string, Request, unknown>, 'method' | 'path'> & { path?: string },
	): ApiHandler<string, Request, unknown> {
		return { ...handler, path: handler.path ?? '', method };
	}
	return define;
}

/** A method helper that requires `path`, for routes that are always Explicit Routes. */
type ExplicitApiMethod = <
	const TPath extends string,
	TSchema extends RouteSchema | undefined = undefined,
	TContext extends UniversalContext = UniversalContext,
>(
	handler: DefineApiHandlerInput<TPath, TSchema, TContext>,
) => ApiHandler<TPath, Request, unknown>;

export const defineGet: ReturnType<typeof defineApiMethod<'GET'>> = defineApiMethod('GET');
export const definePost: ReturnType<typeof defineApiMethod<'POST'>> = defineApiMethod('POST');
export const definePut: ReturnType<typeof defineApiMethod<'PUT'>> = defineApiMethod('PUT');
export const defineDelete: ReturnType<typeof defineApiMethod<'DELETE'>> = defineApiMethod('DELETE');
export const definePatch: ReturnType<typeof defineApiMethod<'PATCH'>> = defineApiMethod('PATCH');
export const defineOptions: ReturnType<typeof defineApiMethod<'OPTIONS'>> = defineApiMethod('OPTIONS');
export const defineHead: ReturnType<typeof defineApiMethod<'HEAD'>> = defineApiMethod('HEAD');
/** Defines a handler for the QUERY method, a safe, idempotent read whose request body carries the query. */
export const defineQuery: ReturnType<typeof defineApiMethod<'QUERY'>> = defineApiMethod('QUERY');

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
	middleware?: readonly Middleware<Request, unknown, any>[];
	routes: readonly ApiHandler<string, Request, unknown>[];
}

type GroupDefineHandler<TContext extends UniversalContext> = {
	<const TPath extends string, TSchema extends RouteSchema | undefined = undefined>(
		handler: DefineApiHandlerInput<TPath, TSchema, TContext> & {
			path: TPath;
			method: ApiHandler<TPath, Request, unknown>['method'];
		},
	): ApiHandler<TPath, Request, unknown>;
	get: ExplicitApiMethod;
	post: ExplicitApiMethod;
	put: ExplicitApiMethod;
	delete: ExplicitApiMethod;
	patch: ExplicitApiMethod;
	options: ExplicitApiMethod;
	head: ExplicitApiMethod;
	query: ExplicitApiMethod;
};

function createGroupApi<TContext extends UniversalContext>(): GroupDefineHandler<TContext> {
	const define = ((handler: ApiHandler<string, Request, unknown>) => handler) as GroupDefineHandler<TContext>;
	return Object.assign(define, {
		get: defineApiMethod('GET'),
		post: defineApiMethod('POST'),
		put: defineApiMethod('PUT'),
		delete: defineApiMethod('DELETE'),
		patch: defineApiMethod('PATCH'),
		options: defineApiMethod('OPTIONS'),
		head: defineApiMethod('HEAD'),
		query: defineApiMethod('QUERY'),
	});
}

export function defineGroupHandler<
	TPrefix extends string,
	TMiddleware extends readonly Middleware<Request, unknown, any>[] = [],
	TContext extends UniversalContext = TMiddleware extends readonly Middleware<Request, unknown, infer TGroupContext>[]
		? TGroupContext
		: UniversalContext,
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
