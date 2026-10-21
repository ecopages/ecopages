import assert from 'node:assert/strict';
import type { Server as NodeHttpServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { ECOPAGES_DEV_RESTART_EXIT_CODE } from '../../dev/development-restart.ts';
import { appLogger } from '../../global/app-logger.ts';
import type {
	ApiHandlerContext,
	ErrorPageTemplateProps,
	Middleware,
	RouteSchema,
	ViewLoader,
} from '../../types/contracts.ts';
import type { ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import { EcopagesApp } from './create-app.ts';
import type { RuntimeHost } from './runtime-host.ts';
import type { NodeServerAdapter, NodeServerAdapterParams } from './server-adapter.ts';

const cliArgs: ReturnParseCliArgs = {
	preview: false,
	build: false,
	start: true,
	dev: false,
	serveOnly: false,
	keepGoing: false,
	port: undefined,
	hostname: undefined,
};

function createRuntimeHost(stop: () => Promise<void> = async () => {}) {
	const server = { id: 'node-server' } as unknown as NodeHttpServer;
	const runtimeHost: RuntimeHost = {
		start: vi.fn().mockResolvedValue(server),
		stop,
		getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
	};
	return { runtimeHost, server };
}

function createServerAdapter(overrides: Record<string, unknown> = {}): NodeServerAdapter {
	return {
		initialize: async () => {},
		getServerOptions: () => ({ port: 3000, hostname: 'localhost' }),
		completeInitialization: async () => {},
		handleRequest: async () => new Response(null, { status: 204 }),
		handleServerRequest: async () => new Response(null, { status: 204 }),
		buildStatic: async () => {},
		servePreviewOnly: async () => {},
		applyBoundPort: () => {},
		listStaticGenerationRoutes: async () => [],
		dispose: async () => {},
		...overrides,
	} as unknown as NodeServerAdapter;
}

function createTestApp(
	createServerAdapterFactory: (params: NodeServerAdapterParams) => Promise<NodeServerAdapter> = async () =>
		createServerAdapter(),
	stop?: () => Promise<void>,
	appCliArgs: ReturnParseCliArgs = cliArgs,
) {
	const { runtimeHost, server } = createRuntimeHost(stop);
	const app = new EcopagesApp(
		{
			appConfig: {
				baseUrl: 'http://localhost:3000',
				appRuntime: { origin: 'http://localhost:3000', hmr: null },
			} as never,
			cliArgs: appCliArgs,
		},
		{ runtimeHost, createServerAdapter: createServerAdapterFactory },
	);
	return { app, runtimeHost, server };
}

describe('EcopagesApp route registration', () => {
	it('forwards registered handlers, schemas, and middleware to the server adapter', async () => {
		const handler = (_context: unknown) => new Response('ok');
		const middleware: Middleware<Request, unknown, ApiHandlerContext<Request, unknown>> = async (_context, next) =>
			await next();
		const groupMiddleware: Middleware<Request, unknown, ApiHandlerContext<Request, unknown>> = async (
			_context,
			next,
		) => await next();
		const routeMiddleware: Middleware<Request, unknown, ApiHandlerContext<Request, unknown>> = async (
			_context,
			next,
		) => await next();
		const schema: RouteSchema = {};
		let receivedHandlers: NodeServerAdapterParams['apiHandlers'];
		const { app } = createTestApp(async (params) => {
			receivedHandlers = params.apiHandlers;
			return createServerAdapter();
		});

		app.get('/direct', handler, { middleware: [middleware], schema });
		app.route('/explicit', 'PUT', handler, { schema });
		app.add({ path: '/prebuilt', method: 'GET', handler, middleware: [middleware], schema });
		app.group('/v1/', (routes) => routes.post('/items', handler, { middleware: [routeMiddleware], schema }), {
			middleware: [groupMiddleware],
		});
		app.group({
			prefix: '/v2/',
			middleware: [groupMiddleware],
			routes: [{ path: 'items', method: 'POST', handler, middleware: [routeMiddleware], schema }],
		});

		await app.fetch(new Request('http://localhost:3000/'));

		expect(receivedHandlers?.map(({ path, method }) => ({ path, method }))).toEqual([
			{ path: '/direct', method: 'GET' },
			{ path: '/explicit', method: 'PUT' },
			{ path: '/prebuilt', method: 'GET' },
			{ path: '/v1/items', method: 'POST' },
			{ path: '/v2/items', method: 'POST' },
		]);
		expect(receivedHandlers?.[0]).toMatchObject({ handler, middleware: [middleware], schema });
		expect(receivedHandlers?.[1]).toMatchObject({ handler, schema });
		expect(receivedHandlers?.[2]).toMatchObject({ handler, middleware: [middleware], schema });
		expect(receivedHandlers?.[3]).toMatchObject({
			handler,
			middleware: [groupMiddleware, routeMiddleware],
			schema,
		});
		expect(receivedHandlers?.[4]).toMatchObject({
			handler,
			middleware: [groupMiddleware, routeMiddleware],
			schema,
		});
	});

	it('registers semantic error page loaders', () => {
		const { app } = createTestApp();
		const notFoundLoader: ViewLoader<ErrorPageTemplateProps> = async () => ({ default: {} as never });
		const serverErrorLoader: ViewLoader<ErrorPageTemplateProps> = async () => ({ default: {} as never });

		app.notFound(notFoundLoader).serverError(serverErrorLoader).forbidden(notFoundLoader);

		expect(app.getErrorPageLoaders()).toEqual({
			notFound: notFoundLoader,
			serverError: serverErrorLoader,
			forbidden: notFoundLoader,
		});
	});
});

describe('EcopagesApp startup', () => {
	it('logs a runtime startup message when no onAppStart callback is registered', async () => {
		const info = vi.spyOn(appLogger, 'info').mockReturnValue(appLogger);
		const { app } = createTestApp();

		try {
			await app.start();

			expect(info.mock.calls[0]?.[0]).toBe('Node server running at http://localhost:3000');
		} finally {
			info.mockRestore();
		}
	});

	it('passes resolved static routes to onAppStart without logging the default message', async () => {
		const info = vi.spyOn(appLogger, 'info').mockReturnValue(appLogger);
		const staticRoutes = [
			{
				requestUrl: 'http://localhost:3000/posts/one',
				pathname: '/posts/one',
				templateRoute: {
					pathname: '/posts/:slug',
					kind: 'dynamic' as const,
					role: 'page' as const,
					filePath: '/project/src/pages/posts/[slug].tsx',
					paramNames: ['slug'],
				},
				params: { slug: 'one' },
			},
		];
		const serverAdapter = createServerAdapter();
		const listStaticGenerationRoutes = vi.fn(function (
			this: NodeServerAdapter & { testRoutes: typeof staticRoutes },
			_input: { runtimeOrigin: string },
		) {
			return Promise.resolve(this.testRoutes);
		});
		Object.assign(serverAdapter, { testRoutes: staticRoutes, listStaticGenerationRoutes });
		const { app } = createTestApp(async () => serverAdapter);
		let receivedRoutes: unknown;

		try {
			await app.start(({ origin, routes }) => {
				expect(origin).toBe('http://localhost:3000');
				receivedRoutes = routes;
			});

			expect(info).not.toHaveBeenCalled();
			expect(receivedRoutes).toEqual([{ pathname: '/posts/one', params: { slug: 'one' } }]);
			expect(listStaticGenerationRoutes).toHaveBeenCalledWith({ runtimeOrigin: 'http://localhost:3000' });
		} finally {
			info.mockRestore();
		}
	});

	it('forwards keep-going to static build without starting the HTTP host', async () => {
		const buildStatic = vi.fn().mockResolvedValue(undefined);
		const servePreviewOnly = vi.fn();
		const { app, runtimeHost } = createTestApp(
			async () => createServerAdapter({ buildStatic, servePreviewOnly }),
			undefined,
			{ ...cliArgs, build: true, keepGoing: true, start: false },
		);

		await app.start();

		expect(buildStatic).toHaveBeenCalledWith({ preview: false, keepGoing: true });
		expect(servePreviewOnly).not.toHaveBeenCalled();
		expect(runtimeHost.start).not.toHaveBeenCalled();
	});

	it('serves an existing export in preview serve-only mode without building or starting the app host', async () => {
		const buildStatic = vi.fn();
		const servePreviewOnly = vi.fn().mockResolvedValue('http://localhost:4000');
		const { app, runtimeHost } = createTestApp(
			async () => createServerAdapter({ buildStatic, servePreviewOnly }),
			undefined,
			{ ...cliArgs, preview: true, serveOnly: true, start: false },
		);

		await app.start();

		expect(servePreviewOnly).toHaveBeenCalledOnce();
		expect(buildStatic).not.toHaveBeenCalled();
		expect(runtimeHost.start).not.toHaveBeenCalled();
	});
});

describe('EcopagesApp development restart', () => {
	it('logs nested shutdown failures and still exits for a restart', async () => {
		const nestedError = new Error('nested cleanup failed');
		const stopError = new AggregateError([nestedError, { code: 'E_RESOURCE_CLEANUP' }], 'stop failed');
		const stop = vi.fn().mockRejectedValue(stopError);
		let restart: ((changedFile: string) => Promise<void>) | undefined;
		const { app } = createTestApp(async (params) => {
			restart = params.onDevelopmentRestart;
			return createServerAdapter();
		}, stop);
		const logged: unknown[] = [];
		const errorLog = vi.spyOn(appLogger, 'error').mockImplementation((...args) => {
			logged.push(...args);
			return appLogger;
		});
		const processExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
			throw new Error(`process.exit:${code}`);
		});

		try {
			await app.start();
			assert.ok(restart);
			await assert.rejects(
				restart('/src/lib/posts.ts'),
				new RegExp(`process\\.exit:${ECOPAGES_DEV_RESTART_EXIT_CODE}`),
			);
			expect(
				logged.some(
					(argument) =>
						typeof argument === 'string' &&
						argument.includes(stopError.stack ?? '') &&
						argument.includes(nestedError.stack ?? '') &&
						argument.includes('{"code":"E_RESOURCE_CLEANUP"}'),
				),
			).toBe(true);
			expect(processExit).toHaveBeenCalledWith(ECOPAGES_DEV_RESTART_EXIT_CODE);
		} finally {
			errorLog.mockRestore();
			processExit.mockRestore();
		}
	});

	it('logs the cause chain of a wrapped shutdown error', async () => {
		const rootCause = new Error('worker pool did not exit');
		const stop = vi.fn().mockRejectedValue(new Error('integration teardown failed', { cause: rootCause }));
		let restart: ((changedFile: string) => Promise<void>) | undefined;
		const { app } = createTestApp(async (params) => {
			restart = params.onDevelopmentRestart;
			return createServerAdapter();
		}, stop);
		const logged: string[] = [];
		const errorLog = vi.spyOn(appLogger, 'error').mockImplementation((...args) => {
			logged.push(...args.filter((argument): argument is string => typeof argument === 'string'));
			return appLogger;
		});
		const processExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
			throw new Error(`process.exit:${code}`);
		});

		try {
			await app.start();
			assert.ok(restart);
			await assert.rejects(
				restart('/src/lib/posts.ts'),
				new RegExp(`process\\.exit:${ECOPAGES_DEV_RESTART_EXIT_CODE}`),
			);
			expect(logged.some((message) => message.includes(`Caused by: ${rootCause.stack}`))).toBe(true);
		} finally {
			errorLog.mockRestore();
			processExit.mockRestore();
		}
	});
});
