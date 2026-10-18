import { createRequire } from '../../../utils/locals-utils.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { ApiResponseBuilder } from './api-response.ts';
import { runMiddlewareChain } from './run-middleware-chain.ts';
import {
	matchParsedSegmentPath,
	parseSegmentPath,
	scoreSegmentPathPattern,
	type ParsedSegmentPath,
} from '../../../router/server/segment-path-matcher.ts';
import { appLogger } from '../../../global/app-logger.ts';
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
} from '../../../types/contracts.ts';
import type { ApiResponseBuilder as ApiResponseBuilderContract } from '../../../types/api-response.ts';

type ParsedRequestBody = { value: unknown } | { response: Response };

export type ApiRequestPipelineOptions = {
	getRenderContext: () => RenderContext;
	getCacheService: () => CacheInvalidator | null;
	/**
	 * Recognises a client that disconnected mid-request.
	 *
	 * @remarks
	 * Such errors are a normal browser behaviour, not a server fault, so
	 * {@link ApiRequestPipeline.handleError} answers them with 499 without logging or
	 * calling `app.onError`. Only the Node adapter supplies it.
	 */
	isClientAbort?: (error: unknown) => boolean;
};

export class ApiRequestPipeline<TRequest extends Request = Request, TServer = unknown> {
	private readonly getRenderContext: () => RenderContext;
	private readonly getCacheService: () => CacheInvalidator | null;
	private readonly isClientAbort: (error: unknown) => boolean;

	constructor(options: ApiRequestPipelineOptions) {
		this.getRenderContext = options.getRenderContext;
		this.getCacheService = options.getCacheService;
		this.isClientAbort = options.isClientAbort ?? (() => false);
	}

	match(
		request: TRequest,
		apiHandlers: ApiHandler<string, TRequest, TServer>[],
		parsedPathSegments?: ParsedSegmentPath,
	): { routeConfig: ApiHandler<string, TRequest, TServer>; params: PageParams } | null {
		const pathname = new URL(request.url).pathname;
		const pathSegments = parsedPathSegments ?? parseSegmentPath(pathname);
		const method = request.method.toUpperCase();

		const sortedHandlers = [...apiHandlers].sort((a, b) => {
			return scoreSegmentPathPattern(b.path, 'api') - scoreSegmentPathPattern(a.path, 'api');
		});

		for (const routeConfig of sortedHandlers) {
			const routeMethod = (routeConfig.method || 'GET').toUpperCase();
			if (routeMethod !== method) {
				continue;
			}

			const params = matchParsedSegmentPath(routeConfig.path, pathSegments, 'api');
			if (params) {
				return { routeConfig, params };
			}
		}

		return null;
	}

	async tryHandle(
		request: TRequest,
		apiHandlers: ApiHandler<string, TRequest, TServer>[],
		serverInstance: TServer | undefined,
		errorHandler?: ErrorHandler<TRequest, TServer>,
		parsedPathSegments?: ParsedSegmentPath,
	): Promise<Response | null> {
		let apiMatch: {
			routeConfig: ApiHandler<string, TRequest, TServer>;
			params: PageParams;
		} | null;
		try {
			apiMatch = this.match(request, apiHandlers, parsedPathSegments);
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
	 * Runtime adapters reuse this for errors that escape the whole request
	 * pipeline so `app.onError` behaves the same on Bun and Node.
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
		if (this.isClientAbort(error)) return new Response(null, { status: 499 });

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

		if (error instanceof HttpError) return error.toResponse();
		appLogger.error('[ecopages] Error handling request', error);
		return new Response('Internal Server Error', { status: 500 });
	}

	private createContext(
		request: TRequest,
		params: PageParams,
		serverInstance: TServer | undefined,
	): ApiHandlerContext<TRequest, TServer> {
		const locals: Record<string, unknown> = {};
		return {
			request,
			params,
			query: parseSearchParams(new URL(request.url).searchParams),
			response: new ApiResponseBuilder(),
			server: serverInstance as TServer,
			locals,
			require: createRequire((): Record<string, unknown> => locals),
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

		let body: unknown;
		if (schema.body) {
			const parsedBody = await this.parseSchemaBody(context.request, context.response);
			if ('response' in parsedBody) return parsedBody.response;
			body = parsedBody.value;
		}

		const validationResult = await validateRequest(
			{ body, query: queryParams, headers, params: context.params },
			schema,
		);

		if (!validationResult.success) {
			return context.response.status(400).json({
				error: 'Validation failed',
				issues: validationResult.errors,
			});
		}

		const validated = validationResult.data!;
		if (validated.body !== undefined) context.body = validated.body;
		if (validated.query !== undefined) context.query = validated.query;
		if (validated.headers !== undefined) context.headers = validated.headers;
		if (validated.params !== undefined) context.params = validated.params as PageParams;
		return undefined;
	}

	private async parseSchemaBody(
		request: TRequest,
		responseBuilder: ApiResponseBuilderContract,
	): Promise<ParsedRequestBody> {
		const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() || '';
		if (!contentType) return this.parseUntypedSchemaBody(request, responseBuilder);
		if (contentType !== 'application/json' && contentType !== 'text/plain') {
			return this.rejectUnsupportedMediaType(request, responseBuilder);
		}
		if (request.body === null) return { value: undefined };

		try {
			const text = await request.clone().text();
			if (text.length === 0) return { value: undefined };
			const value = contentType === 'application/json' ? JSON.parse(text) : text;
			return { value };
		} catch (error) {
			if (this.isClientAbort(error)) throw error;
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
			if (this.isClientAbort(error)) throw error;
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
		const middleware = routeConfig.middleware ?? [];
		return runMiddlewareChain(middleware, context, async () => await routeConfig.handler(context));
	}
}
