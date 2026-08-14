import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	ResponseOptions,
	RouteSchema,
	TypedGroupHandlerContext,
} from '../../../types/public-types.ts';
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

const defineApiMethod =
	<M extends ApiHandler['method']>(method: M) =>
	<
		const TPath extends string,
		TSchema extends RouteSchema | undefined = undefined,
		TContext extends UniversalContext = UniversalContext,
	>(
		handler: DefineApiHandlerInput<TPath, TSchema, TContext> & { path: TPath },
	): ApiHandler<TPath, Request, unknown> =>
		defineApiHandler({ ...handler, method });

export const defineGet: ReturnType<typeof defineApiMethod<'GET'>> = defineApiMethod('GET');
export const definePost: ReturnType<typeof defineApiMethod<'POST'>> = defineApiMethod('POST');
export const definePut: ReturnType<typeof defineApiMethod<'PUT'>> = defineApiMethod('PUT');
export const defineDelete: ReturnType<typeof defineApiMethod<'DELETE'>> = defineApiMethod('DELETE');
export const definePatch: ReturnType<typeof defineApiMethod<'PATCH'>> = defineApiMethod('PATCH');
export const defineOptions: ReturnType<typeof defineApiMethod<'OPTIONS'>> = defineApiMethod('OPTIONS');
export const defineHead: ReturnType<typeof defineApiMethod<'HEAD'>> = defineApiMethod('HEAD');

export function json(data: unknown, options?: ResponseOptions): Response {
	return createBodyResponse('json', data, {
		status: options?.status,
		headers: options?.headers,
	});
}

export function html(content: string, options?: ResponseOptions): Response {
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
	get: ReturnType<typeof defineApiMethod<'GET'>>;
	post: ReturnType<typeof defineApiMethod<'POST'>>;
	put: ReturnType<typeof defineApiMethod<'PUT'>>;
	delete: ReturnType<typeof defineApiMethod<'DELETE'>>;
	patch: ReturnType<typeof defineApiMethod<'PATCH'>>;
	options: ReturnType<typeof defineApiMethod<'OPTIONS'>>;
	head: ReturnType<typeof defineApiMethod<'HEAD'>>;
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
