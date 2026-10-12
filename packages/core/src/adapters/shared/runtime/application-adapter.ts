import type {
	ApiHandler,
	ApiHandlerContext,
	Middleware,
	RouteGroupBuilder,
	RouteOptions,
	RouteSchema,
} from '../../../types/public-types.ts';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteGroupDefinition,
	type RouteHandler,
} from '../../abstract/application-adapter.ts';
import { ECOPAGES_DEV_RESTART_EXIT_CODE } from '../../../dev/development-restart.ts';
import { appLogger } from '../../../global/app-logger.ts';

function formatRestartStopFailure(error: unknown): string {
	if (error instanceof Error) {
		const nested = error instanceof AggregateError ? error.errors : [];
		const causes = error.cause === undefined ? [] : [`Caused by: ${formatRestartStopFailure(error.cause)}`];
		return [error.stack ?? error.message, ...nested.map(formatRestartStopFailure), ...causes].join('\n');
	}

	if (typeof error === 'string') {
		return error;
	}

	if (typeof error === 'object' && error !== null) {
		try {
			return JSON.stringify(error) ?? String(error);
		} catch {
			return String(error);
		}
	}

	return String(error);
}

export abstract class SharedApplicationAdapter<
	TOptions extends ApplicationAdapterOptions = ApplicationAdapterOptions,
	TServer = any,
	TRequest extends Request = Request,
> extends AbstractApplicationAdapter<TOptions, TServer, TRequest> {
	protected register<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.addRouteHandler(path, method, handler, options?.middleware, options?.schema);
	}

	get<P extends string, TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'GET', handler, options);
	}

	post<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'POST', handler, options);
	}

	put<P extends string, TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'PUT', handler, options);
	}

	delete<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'DELETE', handler, options);
	}

	patch<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'PATCH', handler, options);
	}

	options<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'OPTIONS', handler, options);
	}

	head<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this {
		return this.register(path, 'HEAD', handler, options);
	}

	route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<TRequest, TServer>,
		options?: RouteOptions<TRequest, TServer>,
	): this {
		return this.register(path, method, handler, options);
	}

	add(handler: ApiHandler<string, TRequest, TServer>): this {
		return this.addRouteHandler(handler.path, handler.method, handler.handler, handler.middleware, handler.schema);
	}

	group<TMiddleware extends readonly Middleware<TRequest, TServer, any>[] = []>(
		prefixOrGroup: string | RouteGroupDefinition<TRequest, TServer>,
		callback?: (
			builder: TMiddleware extends readonly Middleware<TRequest, TServer, infer TContext>[]
				? RouteGroupBuilder<TRequest, TServer, TContext>
				: RouteGroupBuilder<TRequest, TServer>,
		) => void,
		options?: {
			middleware?: TMiddleware;
		},
	): this {
		if (typeof prefixOrGroup === 'object') {
			return this.registerGroup(prefixOrGroup);
		}

		type TContext = TMiddleware extends readonly Middleware<TRequest, TServer, infer TCtx>[]
			? TCtx
			: ApiHandlerContext<TRequest, TServer>;

		const normalizedPrefix = prefixOrGroup.endsWith('/') ? prefixOrGroup.slice(0, -1) : prefixOrGroup;
		const groupMiddleware = (options?.middleware ?? []) as Middleware<TRequest, TServer, TContext>[];

		const createHandler = (
			method: ApiHandler['method'],
		): RouteGroupBuilder<TRequest, TServer, TContext>[Lowercase<typeof method>] => {
			return ((
				path: string,
				handler: (context: TContext) => Promise<Response> | Response,
				routeOptions?: RouteOptions<TRequest, TServer, TContext> & { schema?: RouteSchema },
			) => {
				const combinedMiddleware: Middleware<TRequest, TServer, TContext>[] = [
					...groupMiddleware,
					...(routeOptions?.middleware ?? []),
				];
				const fullPath = path === '/' ? normalizedPrefix : `${normalizedPrefix}${path}`;
				this.addRouteHandler(
					fullPath,
					method,
					handler as RouteHandler<TRequest, TServer, ApiHandlerContext<TRequest, TServer>>,
					combinedMiddleware.length > 0
						? (combinedMiddleware as Middleware<TRequest, TServer, ApiHandlerContext<TRequest, TServer>>[])
						: undefined,
					routeOptions?.schema,
				);
				return builder;
			}) as RouteGroupBuilder<TRequest, TServer, TContext>[Lowercase<typeof method>];
		};

		const builder: RouteGroupBuilder<TRequest, TServer, TContext> = {
			get: createHandler('GET'),
			post: createHandler('POST'),
			put: createHandler('PUT'),
			delete: createHandler('DELETE'),
			patch: createHandler('PATCH'),
			options: createHandler('OPTIONS'),
			head: createHandler('HEAD'),
		};

		callback?.(builder as never);
		return this;
	}

	private registerGroup(group: RouteGroupDefinition<TRequest, TServer>): this {
		const normalizedPrefix = group.prefix.endsWith('/') ? group.prefix.slice(0, -1) : group.prefix;
		const groupMiddleware = group.middleware ?? [];

		for (const route of group.routes) {
			const normalizedPath = route.path.startsWith('/') ? route.path : `/${route.path}`;
			const fullPath = route.path === '/' ? normalizedPrefix : `${normalizedPrefix}${normalizedPath}`;
			const combinedMiddleware = [...groupMiddleware, ...(route.middleware ?? [])];

			this.addRouteHandler(
				fullPath,
				route.method,
				route.handler,
				combinedMiddleware.length > 0 ? combinedMiddleware : undefined,
				route.schema,
			);
		}

		return this;
	}

	/**
	 * @remarks
	 * Stopping can close the watcher before cleanup rejects. Exiting with failure prevents the child from
	 * continuing without reliable subscriptions and prevents the CLI from treating incomplete cleanup as a clean restart.
	 */
	protected createDevelopmentRestartHandler(): (changedFile: string) => Promise<void> {
		return async (changedFile: string) => {
			appLogger.info(`Restarting the development server (${changedFile} changed)...`);
			try {
				await this.stop();
			} catch (error) {
				appLogger.error(
					`Failed to stop the development server before restart: ${formatRestartStopFailure(error)}`,
				);
				process.exit(1);
			}
			process.exit(ECOPAGES_DEV_RESTART_EXIT_CODE);
		};
	}
}
