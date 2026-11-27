import { HttpError } from '../../../errors/http-error.ts';
import { ApiResponseBuilder } from './api-response.ts';
import { flattenMiddleware } from '../../../middleware/create-middleware.ts';
import { runMiddlewareChain } from './run-middleware-chain.ts';
import {
	matchParsedSegmentPath,
	parseSegmentPath,
	compileSegmentPattern,
	type SegmentPattern,
	type ParsedSegmentPath,
} from '../../../router/server/segment-path-matcher.ts';
import { DEFAULT_MAX_REQUEST_BODY_SIZE } from '../../../constants.ts';
import { readSchemaBody } from './schema-body.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { isNodeClientAbortError } from '../../node/http-request-bridge.ts';
import { validateRequest } from '../../../validation/validate-request.ts';
import { parseSearchParams } from '../../../router/server/parse-search-params.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	PageParams,
	PageQuery,
	RenderContext,
	RequestValidationIssue,
} from '../../../types/contracts.ts';

/**
 * API handlers with their patterns parsed and ordered from most to least specific.
 *
 * @remarks Build it with {@link compileApiRoutes} when the handlers are known, so a request only walks the
 * list. Equal scores keep registration order.
 */
export type ApiRoutes<TRequest extends Request = Request, TServer = unknown> = ReadonlyArray<{
	handler: ApiHandler<string, TRequest, TServer>;
	/** The handler's method, upper-cased; `GET` when the handler names none. */
	method: string;
	pattern: SegmentPattern<'api'>;
}>;

function validatedMiddleware<TRequest extends Request, TServer>(
	handler: ApiHandler<string, TRequest, TServer>,
): ApiHandler<string, TRequest, TServer> {
	flattenMiddleware(handler.middleware, `route ${handler.method} ${handler.path}`);
	return handler;
}

export function compileApiRoutes<TRequest extends Request = Request, TServer = unknown>(
	handlers: readonly ApiHandler<string, TRequest, TServer>[],
): ApiRoutes<TRequest, TServer> {
	return handlers
		.map((handler) => ({
			handler: validatedMiddleware(handler),
			method: (handler.method || 'GET').toUpperCase(),
			pattern: compileSegmentPattern(handler.path, 'api'),
		}))
		.sort((a, b) => b.pattern.score - a.pattern.score);
}

export type ApiRequestPipelineOptions = {
	getRenderContext: () => RenderContext;
	getCacheService: () => CacheInvalidator | null;
	/**
	 * The most bytes a `schema.body` reads, {@link DEFAULT_MAX_REQUEST_BODY_SIZE} when omitted. A bigger body
	 * answers HTTP 413 and `Infinity` sets no limit.
	 */
	getMaxRequestBodySize?: () => number;
};

export class ApiRequestPipeline<TRequest extends Request = Request, TServer = unknown> {
	private readonly getRenderContext: () => RenderContext;
	private readonly getCacheService: () => CacheInvalidator | null;
	private readonly getMaxRequestBodySize: () => number;

	constructor(options: ApiRequestPipelineOptions) {
		this.getRenderContext = options.getRenderContext;
		this.getCacheService = options.getCacheService;
		this.getMaxRequestBodySize = options.getMaxRequestBodySize ?? (() => DEFAULT_MAX_REQUEST_BODY_SIZE);
	}

	match(
		request: TRequest,
		apiRoutes: ApiRoutes<TRequest, TServer>,
		parsedPathSegments?: ParsedSegmentPath,
	): { routeConfig: ApiHandler<string, TRequest, TServer>; params: PageParams } | null {
		const pathname = new URL(request.url).pathname;
		const pathSegments = parsedPathSegments ?? parseSegmentPath(pathname);
		const method = request.method.toUpperCase();

		for (const { handler, method: routeMethod, pattern } of apiRoutes) {
			if (routeMethod !== method) {
				continue;
			}

			const params = matchParsedSegmentPath(pattern, pathSegments);
			if (params) {
				return { routeConfig: handler, params };
			}
		}

		return null;
	}

	async tryHandle(
		request: TRequest,
		apiRoutes: ApiRoutes<TRequest, TServer>,
		serverInstance: TServer | undefined,
		errorHandler?: ErrorHandler<TRequest, TServer>,
		parsedPathSegments?: ParsedSegmentPath,
	): Promise<Response | null> {
		let apiMatch: {
			routeConfig: ApiHandler<string, TRequest, TServer>;
			params: PageParams;
		} | null;
		try {
			apiMatch = this.match(request, apiRoutes, parsedPathSegments);
		} catch (error) {
			return await this.handleError(error, { request, serverInstance, errorHandler });
		}
		if (!apiMatch) {
			return null;
		}

		return await this.execute(request, apiMatch.params, apiMatch.routeConfig, serverInstance, errorHandler);
	}

	async execute(
		request: TRequest,
		params: PageParams,
		routeConfig: ApiHandler<string, TRequest, TServer>,
		serverInstance: TServer | undefined,
		errorHandler?: ErrorHandler<TRequest, TServer>,
	): Promise<Response> {
		let context: ApiHandlerContext<TRequest, TServer> | undefined;

		try {
			context = this.createContext(request, params, serverInstance);
			const schemaResponse = await this.applyRequestSchema(context, routeConfig);
			if (schemaResponse) {
				return schemaResponse;
			}

			return await this.runMiddlewareChain(context, routeConfig);
		} catch (error) {
			return await this.handleError(error, { request, params, serverInstance, errorHandler, context });
		}
	}

	/**
	 * Resolves an error that escaped a handler into a response.
	 *
	 * @remarks
	 * Precedence is a thrown `Response`, then a client abort (499), then the app
	 * `onError` handler, then `HttpError.toResponse()`, then a logged plain 500.
	 * A client abort is a browser leaving mid-request, not a server fault, so it
	 * is neither logged nor passed to `onError`. Runtime adapters reuse this for errors that escape the whole request
	 * pipeline so `app.onError` also covers them.
	 */
	async handleError(
		error: unknown,
		options: {
			request: TRequest;
			params?: PageParams;
			serverInstance: TServer | undefined;
			errorHandler?: ErrorHandler<TRequest, TServer>;
			context?: ApiHandlerContext<TRequest, TServer>;
		},
	): Promise<Response> {
		if (error instanceof Response) return error;
		if (isNodeClientAbortError(error)) return new Response(null, { status: 499 });

		if (options.errorHandler) {
			try {
				const context =
					options.context ??
					this.createContext(options.request, options.params ?? {}, options.serverInstance);
				return await options.errorHandler(error, context);
			} catch (handlerError) {
				appLogger.error('[ecopages] Error in custom error handler', handlerError);
			}
		}

		if (HttpError.isHttpError(error)) return HttpError.responseFor(error);
		appLogger.error('[ecopages] Error handling request', error);
		return new Response('Internal Server Error', { status: 500 });
	}

	private createContext(
		request: TRequest,
		params: PageParams,
		serverInstance: TServer | undefined,
	): ApiHandlerContext<TRequest, TServer> {
		return {
			request,
			params,
			query: parseSearchParams(new URL(request.url).searchParams),
			response: new ApiResponseBuilder(),
			server: serverInstance as TServer,
			locals: {},
			services: {
				cache: this.getCacheService(),
			},
			...this.getRenderContext(),
		};
	}

	private async applyRequestSchema(
		context: ApiHandlerContext<TRequest, TServer>,
		{ schema, onInvalid }: ApiHandler<string, TRequest, TServer>,
	): Promise<Response | undefined> {
		if (!schema) {
			return undefined;
		}

		const url = new URL(context.request.url);
		const queryParams: PageQuery = parseSearchParams(url.searchParams);
		const headers = Object.fromEntries(context.request.headers);

		const validationResult = await validateRequest(
			{ query: queryParams, headers, params: context.params },
			{ query: schema.query, headers: schema.headers, params: schema.params },
		);

		if (!validationResult.success) return this.validationFailed(context, validationResult.errors!, onInvalid);

		const validated = validationResult.data!;
		if (validated.query !== undefined) context.query = validated.query as PageQuery;
		if (validated.headers !== undefined) context.headers = validated.headers;
		if (validated.params !== undefined) context.params = validated.params as PageParams;
		return undefined;
	}

	private async validationFailed(
		context: ApiHandlerContext<TRequest, TServer>,
		issues: RequestValidationIssue[],
		onInvalid: ApiHandler<string, TRequest, TServer>['onInvalid'],
	): Promise<Response> {
		if (onInvalid) return await onInvalid(issues, context);
		return context.response.status(400).json({ error: 'Validation failed', issues });
	}

	/**
	 * Parses and validates the body against `schema.body`, when the route declares one.
	 *
	 * @remarks
	 * It runs after the route's middleware, so a middleware that refuses the request answers before any of the
	 * body is read.
	 */
	private async applyBodySchema(
		context: ApiHandlerContext<TRequest, TServer>,
		{ schema, onInvalid }: ApiHandler<string, TRequest, TServer>,
	): Promise<Response | undefined> {
		if (!schema?.body) return undefined;

		const parsedBody = await readSchemaBody(context.request, this.getMaxRequestBodySize());
		if ('status' in parsedBody) {
			const refusal = context.response.status(parsedBody.status);
			return (parsedBody.status === 413 ? refusal.headers({ Connection: 'close' }) : refusal).json({
				error: parsedBody.error,
			});
		}

		const validationResult = await validateRequest({ body: parsedBody.value }, { body: schema.body });
		if (!validationResult.success) return this.validationFailed(context, validationResult.errors!, onInvalid);

		const { body } = validationResult.data!;
		if (body !== undefined) context.body = body;
		return undefined;
	}

	private async runMiddlewareChain(
		context: ApiHandlerContext<TRequest, TServer>,
		routeConfig: ApiHandler<string, TRequest, TServer>,
	): Promise<Response> {
		const middleware = flattenMiddleware<ApiHandlerContext<TRequest, TServer>>(
			routeConfig.middleware,
			`route ${routeConfig.method} ${routeConfig.path}`,
		);
		return runMiddlewareChain(middleware, context, async () => {
			const bodyResponse = await this.applyBodySchema(context, routeConfig);
			return bodyResponse ?? (await routeConfig.handler(context));
		});
	}
}
