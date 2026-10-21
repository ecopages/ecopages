import type { RouteMatch, TemplateRoute } from '../../../router/server/route-registry.ts';
import { segmentPathPatternKey } from '../../../router/server/segment-path-matcher.ts';
import {
	API_HANDLER_METHODS,
	type ApiHandler,
	type ApiHandlerMethod,
	type ErrorHandler,
} from '../../../types/contracts.ts';
import { invariant } from '../../../utils/invariant.ts';
import type { ApiRequestPipeline } from './api-request-pipeline.ts';

type EndpointHandler = ApiHandler<string, Request, unknown>;

/** The per-request values an endpoint needs so its errors reach `app.onError`. */
export type EndpointRequestContext = {
	errorHandler?: ErrorHandler<Request, unknown>;
	serverInstance?: unknown;
};

export type EndpointRouteHandlerOptions = {
	apiRequestPipeline: ApiRequestPipeline<Request, unknown>;
	/** The server-module loader Pages use, so a dev save drops the cached endpoint module. */
	importServerModule: (filePath: string) => Promise<Record<string, unknown>>;
};

type EndpointFile = Pick<TemplateRoute, 'pathname' | 'filePath'>;

function isApiHandler(value: unknown): value is EndpointHandler {
	return (
		typeof value === 'object' &&
		value !== null &&
		'handler' in value &&
		typeof value.handler === 'function' &&
		'method' in value &&
		typeof value.method === 'string'
	);
}

function methodHelperName(method: ApiHandlerMethod): string {
	return `define${method[0]}${method.slice(1).toLowerCase()}`;
}

/**
 * Reads the method handlers an endpoint module exports, keyed in `Allow` header order.
 *
 * @remarks
 * Exports other than the method names are ignored. A method export that is not a method-helper
 * result, is built for another method, or sets `path` fails the load: the file is the one owner of
 * the URL.
 */
export function readEndpointHandlers(
	module: Record<string, unknown>,
	{ filePath, pathname }: EndpointFile,
): ReadonlyMap<ApiHandlerMethod, EndpointHandler> {
	const handlers = new Map<ApiHandlerMethod, EndpointHandler>();

	for (const method of API_HANDLER_METHODS) {
		const value = module[method];
		if (value === undefined) {
			continue;
		}

		const exportName = `${filePath}: the ${method} export of the endpoint "${pathname}"`;
		invariant(
			isApiHandler(value),
			`${exportName} is not a request handler. Build it with ${methodHelperName(method)}().`,
		);
		invariant(
			value.method === method,
			`${exportName} is a ${value.method} handler. Build it with ${methodHelperName(method)}().`,
		);
		invariant(
			!value.path,
			`${exportName} sets path "${value.path}". The file gives the endpoint its path; remove path.`,
		);
		handlers.set(method, value);
	}

	invariant(
		handlers.size > 0,
		`${filePath} defines the endpoint "${pathname}" but exports no request handler. Export at least one of ${API_HANDLER_METHODS.join(', ')}, built with defineGet() or another method helper.`,
	);
	return handlers;
}

/**
 * Lists one warning per Explicit Route registered on the same pathname as an endpoint file.
 *
 * @remarks
 * Explicit Routes match first, so each one keeps its method and the file answers the rest.
 * `:slug` and `[slug]` are the same slot, as are `*` and `[...slug]`.
 */
export function findExplicitRoutesOnEndpoints(
	apiHandlers: readonly Pick<ApiHandler, 'method' | 'path'>[],
	templateRoutes: readonly Pick<TemplateRoute, 'pathname' | 'filePath' | 'role'>[],
): string[] {
	const endpointsByKey = new Map(
		templateRoutes
			.filter((route) => route.role === 'endpoint')
			.map((route) => [segmentPathPatternKey(route.pathname, 'filesystem'), route]),
	);

	return apiHandlers.flatMap(({ method, path }) => {
		const endpoint = endpointsByKey.get(segmentPathPatternKey(path, 'api'));
		return endpoint
			? [
					`The app route ${method} ${path} and the endpoint file ${endpoint.filePath} both answer "${endpoint.pathname}". The app route answers ${method}; the file answers its other methods.`,
				]
			: [];
	});
}

/**
 * Answers a request matched to an endpoint Template Route through the API pipeline.
 *
 * @remarks
 * The module is imported on every request; the server-module loader caches it until a dev save
 * invalidates it. A load error resolves like a handler error, through `app.onError`.
 */
export class EndpointRouteHandler {
	private readonly apiRequestPipeline: ApiRequestPipeline<Request, unknown>;
	private readonly importServerModule: EndpointRouteHandlerOptions['importServerModule'];

	constructor({ apiRequestPipeline, importServerModule }: EndpointRouteHandlerOptions) {
		this.apiRequestPipeline = apiRequestPipeline;
		this.importServerModule = importServerModule;
	}

	async handleMatch(match: RouteMatch, request: Request, context: EndpointRequestContext): Promise<Response> {
		const { errorHandler, serverInstance } = context;
		let handlers: ReadonlyMap<ApiHandlerMethod, EndpointHandler>;
		try {
			const module = await this.importServerModule(match.templateRoute.filePath);
			handlers = readEndpointHandlers(module, match.templateRoute);
		} catch (error) {
			return await this.apiRequestPipeline.handleError(error, {
				request,
				params: match.params,
				serverInstance,
				errorHandler,
			});
		}

		const requestMethod = request.method.toUpperCase();
		const method = API_HANDLER_METHODS.find((candidate) => candidate === requestMethod);
		const handler = method && handlers.get(method);
		if (!handler) {
			return new Response(null, { status: 405, headers: { Allow: [...handlers.keys()].join(', ') } });
		}

		return await this.apiRequestPipeline.execute(request, match.params, handler, serverInstance, errorHandler);
	}
}
