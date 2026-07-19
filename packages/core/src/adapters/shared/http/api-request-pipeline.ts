import { createRequire } from '../../../utils/locals-utils.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { ApiResponseBuilder } from './api-response.ts';
import { runMiddlewareChain } from './run-middleware-chain.ts';
import { matchApiPathPattern, scoreApiPathPattern } from '../../abstract/segment-path-matcher.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { SchemaValidationService } from '../../../services/validation/schema-validation-service.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	RenderContext,
} from '../../../types/public-types.ts';

export type ApiRequestPipelineOptions = {
	schemaValidator: SchemaValidationService;
	getRenderContext: () => RenderContext;
	getCacheService: () => CacheInvalidator | null;
};

export class ApiRequestPipeline<TRequest extends Request = Request, TServer = unknown> {
	private readonly schemaValidator: SchemaValidationService;
	private readonly getRenderContext: () => RenderContext;
	private readonly getCacheService: () => CacheInvalidator | null;

	constructor(options: ApiRequestPipelineOptions) {
		this.schemaValidator = options.schemaValidator;
		this.getRenderContext = options.getRenderContext;
		this.getCacheService = options.getCacheService;
	}

	match(
		request: TRequest,
		apiHandlers: ApiHandler<string, TRequest, TServer>[],
	): { routeConfig: ApiHandler<string, TRequest, TServer>; params: Record<string, string | string[]> } | null {
		const pathname = new URL(request.url).pathname;
		const method = request.method.toUpperCase();

		const sortedHandlers = [...apiHandlers].sort((a, b) => {
			return scoreApiPathPattern(b.path) - scoreApiPathPattern(a.path);
		});

		for (const routeConfig of sortedHandlers) {
			const routeMethod = (routeConfig.method || 'GET').toUpperCase();
			if (routeMethod !== method) {
				continue;
			}

			const params = matchApiPathPattern(routeConfig.path, pathname);
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
	): Promise<Response | null> {
		const apiMatch = this.match(request, apiHandlers);
		if (!apiMatch) {
			return null;
		}

		return await this.execute(request, apiMatch.params, apiMatch.routeConfig, serverInstance, errorHandler);
	}

	async execute(
		request: TRequest,
		params: Record<string, string | string[]>,
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
			if (error instanceof Response) return error;

			if (errorHandler) {
				try {
					if (!context) {
						context = this.createContext(request, params, serverInstance);
					}
					return await errorHandler(error, context);
				} catch (handlerError) {
					appLogger.error(`[ecopages] Error in custom error handler: ${handlerError}`);
				}
			}

			if (error instanceof HttpError) return error.toResponse();
			appLogger.error(`[ecopages] Error handling API request: ${error}`);
			return new Response('Internal Server Error', { status: 500 });
		}
	}

	private createContext(
		request: TRequest,
		params: Record<string, string | string[]>,
		serverInstance: TServer | undefined,
	): ApiHandlerContext<TRequest, TServer> {
		const locals: Record<string, unknown> = {};
		const normalizedParams = this.normalizeParams(params);

		return {
			request,
			params: normalizedParams,
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

	private normalizeParams(params: Record<string, string | string[]>): Record<string, string> {
		return Object.fromEntries(
			Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join('/') : value]),
		);
	}

	private async applyRequestSchema(
		context: ApiHandlerContext<TRequest, TServer>,
		schema: ApiHandler<string, TRequest, TServer>['schema'],
	): Promise<Response | undefined> {
		if (!schema) {
			return undefined;
		}

		const url = new URL(context.request.url);
		const queryParams = Object.fromEntries(url.searchParams);
		const headers = Object.fromEntries(context.request.headers);

		let body: unknown;
		if (schema.body) {
			try {
				const contentType = context.request.headers.get('Content-Type') || '';
				if (contentType.includes('application/json')) body = await context.request.clone().json();
				else if (contentType.includes('text/plain')) body = await context.request.clone().text();
			} catch {
				return context.response.status(400).json({ error: 'Invalid request body' });
			}
		}

		const validationResult = await this.schemaValidator.validateRequest(
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
		if (validated.params !== undefined) context.params = validated.params as Record<string, string>;
		return undefined;
	}

	private async runMiddlewareChain(
		context: ApiHandlerContext<TRequest, TServer>,
		routeConfig: ApiHandler<string, TRequest, TServer>,
	): Promise<Response> {
		const middleware = routeConfig.middleware ?? [];
		return runMiddlewareChain(middleware, context, async () => await routeConfig.handler(context));
	}
}
