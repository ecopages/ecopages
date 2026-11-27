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
import { appLogger } from '../../../global/app-logger.ts';
import { isNodeClientAbortError } from '../../node/http-request-bridge.ts';
import { validateRequest } from '../../../validation/validate-request.ts';
import { groupRepeatedKeys, parseSearchParams } from '../../../router/server/parse-search-params.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	PageParams,
	PageQuery,
	RenderContext,
} from '../../../types/contracts.ts';
import type { ApiResponseBuilder as ApiResponseBuilderContract } from '../../../types/api-response.ts';

type ParsedRequestBody = { value: unknown } | { response: Response };

type BodyParser = (request: Request) => Promise<unknown>;

/**
 * Thrown into the body stream of a schema body that grows past the limit, so the parser that reads it rejects.
 */
class BodyTooLargeError extends Error {
	constructor() {
		super('The request body is larger than the limit.');
	}
}

const isBodyTooLarge = (error: unknown): boolean =>
	error instanceof BodyTooLargeError || (error instanceof Error && error.cause instanceof BodyTooLargeError);

/**
 * A copy of the request whose body fails with {@link BodyTooLargeError} once it passes `limit` bytes.
 *
 * @remarks
 * It reads a clone of the body, so the handler can still read the original request. A request without a body is
 * returned as it is.
 */
function limitBody(request: Request, limit: number): Request {
	if (request.body === null || limit === Number.POSITIVE_INFINITY) return request;
	let received = 0;
	const counter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength;
			if (received > limit) throw new BodyTooLargeError();
			controller.enqueue(chunk);
		},
	});
	return new Request(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.clone().body!.pipeThrough(counter),
		duplex: 'half',
	} as RequestInit);
}

const parseTextBody = async (request: Request): Promise<string | undefined> => {
	if (request.body === null) return undefined;
	const text = await request.text();
	return text.length === 0 ? undefined : text;
};

const parseFormBody: BodyParser = async (request) =>
	request.body === null ? {} : groupRepeatedKeys(await request.formData());

/**
 * The content types a body schema reads, each with the parser that turns the request into the value to
 * validate. A parser receives a request it may consume, so the handler can still read the original.
 */
const bodyParsers: ReadonlyMap<string, BodyParser> = new Map([
	['text/plain', parseTextBody],
	[
		'application/json',
		async (request) => {
			const text = await parseTextBody(request);
			return text === undefined ? undefined : JSON.parse(text);
		},
	],
	['application/x-www-form-urlencoded', parseFormBody],
	['multipart/form-data', parseFormBody],
]);

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
	 * The most bytes a `schema.body` reads, or `undefined` for {@link DEFAULT_MAX_REQUEST_BODY_SIZE}. A bigger body
	 * answers HTTP 413 and `Infinity` sets no limit.
	 */
	getMaxRequestBodySize?: () => number | undefined;
};

export class ApiRequestPipeline<TRequest extends Request = Request, TServer = unknown> {
	private readonly getRenderContext: () => RenderContext;
	private readonly getCacheService: () => CacheInvalidator | null;
	private readonly getMaxRequestBodySize: () => number | undefined;

	constructor(options: ApiRequestPipelineOptions) {
		this.getRenderContext = options.getRenderContext;
		this.getCacheService = options.getCacheService;
		this.getMaxRequestBodySize = options.getMaxRequestBodySize ?? (() => undefined);
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
			const schemaResponse = await this.applyRequestSchema(context, routeConfig.schema);
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
		schema: ApiHandler<string, TRequest, TServer>['schema'],
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

		if (!validationResult.success) {
			return context.response.status(400).json({
				error: 'Validation failed',
				issues: validationResult.errors,
			});
		}

		const validated = validationResult.data!;
		if (validated.query !== undefined) context.query = validated.query as PageQuery;
		if (validated.headers !== undefined) context.headers = validated.headers;
		if (validated.params !== undefined) context.params = validated.params as PageParams;
		return undefined;
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
		schema: ApiHandler<string, TRequest, TServer>['schema'],
	): Promise<Response | undefined> {
		if (!schema?.body) return undefined;

		const parsedBody = await this.parseSchemaBody(context.request, context.response);
		if ('response' in parsedBody) return parsedBody.response;

		const validationResult = await validateRequest({ body: parsedBody.value }, { body: schema.body });
		if (!validationResult.success) {
			return context.response.status(400).json({
				error: 'Validation failed',
				issues: validationResult.errors,
			});
		}

		const { body } = validationResult.data!;
		if (body !== undefined) context.body = body;
		return undefined;
	}

	private async rejectBodyTooLarge(
		request: TRequest,
		responseBuilder: ApiResponseBuilderContract,
	): Promise<ParsedRequestBody> {
		await request.body?.cancel();
		return { response: responseBuilder.status(413).json({ error: 'Payload Too Large' }) };
	}

	private async parseSchemaBody(
		request: TRequest,
		responseBuilder: ApiResponseBuilderContract,
	): Promise<ParsedRequestBody> {
		const limit = this.getMaxRequestBodySize() ?? DEFAULT_MAX_REQUEST_BODY_SIZE;
		const declaredLength = Number(request.headers.get('content-length'));
		if (declaredLength > limit) return this.rejectBodyTooLarge(request, responseBuilder);

		const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() || '';
		if (!contentType) return this.parseUntypedSchemaBody(request, responseBuilder);
		const parseBody = bodyParsers.get(contentType);
		if (!parseBody) return this.rejectUnsupportedMediaType(request, responseBuilder);

		try {
			return { value: await parseBody(limitBody(request, limit)) };
		} catch (error) {
			if (isNodeClientAbortError(error)) throw error;
			if (isBodyTooLarge(error)) return this.rejectBodyTooLarge(request, responseBuilder);
			return { response: responseBuilder.status(400).json({ error: 'Invalid request body' }) };
		}
	}

	private async parseUntypedSchemaBody(
		request: TRequest,
		responseBuilder: ApiResponseBuilderContract,
	): Promise<ParsedRequestBody> {
		try {
			const hasBody = await this.hasBodyContent(request);
			return hasBody
				? { response: responseBuilder.status(415).json({ error: 'Unsupported Media Type' }) }
				: { value: undefined };
		} catch (error) {
			if (isNodeClientAbortError(error)) throw error;
			return { response: responseBuilder.status(400).json({ error: 'Invalid request body' }) };
		}
	}

	private async rejectUnsupportedMediaType(
		request: TRequest,
		responseBuilder: ApiResponseBuilderContract,
	): Promise<ParsedRequestBody> {
		await request.body?.cancel();
		return { response: responseBuilder.status(415).json({ error: 'Unsupported Media Type' }) };
	}

	private async hasBodyContent(request: TRequest): Promise<boolean> {
		const body = request.clone().body;
		if (!body) return false;
		const reader = body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) return false;
				if (value.byteLength === 0) continue;
				await Promise.all([reader.cancel(), request.body?.cancel()]);
				return true;
			}
		} finally {
			reader.releaseLock();
		}
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
			const bodyResponse = await this.applyBodySchema(context, routeConfig.schema);
			return bodyResponse ?? (await routeConfig.handler(context));
		});
	}
}
