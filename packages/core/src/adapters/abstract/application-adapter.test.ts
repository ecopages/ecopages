import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteHandler,
	type RouteGroupDefinition,
} from './application-adapter.ts';
import type { ApiHandlerContext, ViewLoader } from '../../types/public-types.ts';

class TestApplicationAdapter extends AbstractApplicationAdapter<ApplicationAdapterOptions, unknown, Request> {
	constructor(options: ApplicationAdapterOptions) {
		super(options, 'Node');
	}

	public emitListening(origin: string): Promise<void> {
		return this.notifyListening(origin);
	}

	get<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	post<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	put<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	delete<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	patch<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	options<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	head<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		_path: P,
		_handler: RouteHandler<Request, unknown, TContext>,
	): this {
		return this;
	}

	route<P extends string>(_path: P, _method: 'GET', _handler: RouteHandler<Request, unknown>): this {
		return this;
	}

	add(): this {
		return this;
	}

	group(_prefix: string, _callback: (builder: unknown) => void): this;
	group(_group: RouteGroupDefinition<Request, unknown>): this;
	group(): this {
		return this;
	}

	override static<P>(_path: string, _loader: ViewLoader<P> | string | URL): this {
		return this;
	}

	protected async initializeServerAdapter(): Promise<void> {
		return;
	}

	async fetch(_request: Request): Promise<Response> {
		return new Response(null, { status: 204 });
	}

	protected async bootServer(): Promise<void> {
		return;
	}
}

describe('application adapter error pages', () => {
	it('registers not-found and server-error view loaders', () => {
		const adapter = new TestApplicationAdapter({
			appConfig: {
				runtime: {},
			} as ApplicationAdapterOptions['appConfig'],
		});
		const notFoundLoader = async () => ({ default: {} as never });
		const serverErrorLoader = async () => ({ default: {} as never });

		adapter.notFound(notFoundLoader).serverError(serverErrorLoader).forbidden(notFoundLoader);

		assert.deepEqual(adapter.getErrorPageLoaders(), {
			notFound: notFoundLoader,
			serverError: serverErrorLoader,
			forbidden: notFoundLoader,
		});
	});
});

describe('application adapter listening', () => {
	it('logs a default runtime startup message when no onAppStart callback is registered', () => {
		const infoSpy = vi.spyOn(appLogger, 'info').mockReturnValue(appLogger);
		const adapter = new TestApplicationAdapter({
			appConfig: {
				runtime: {},
			} as ApplicationAdapterOptions['appConfig'],
		});

		adapter.emitListening('http://localhost:3000/');

		assert.equal(infoSpy.mock.calls[0]?.[0], 'Node server running at http://localhost:3000');
		infoSpy.mockRestore();
	});

	it('skips the default startup message when an onAppStart callback is registered', async () => {
		const infoSpy = vi.spyOn(appLogger, 'info').mockReturnValue(appLogger);
		const adapter = new TestApplicationAdapter({
			appConfig: {
				runtime: {},
			} as ApplicationAdapterOptions['appConfig'],
		});

		let receivedRoutes: unknown;
		await adapter.start(({ origin, routes }) => {
			assert.equal(origin, 'http://localhost:3000');
			receivedRoutes = routes;
		});
		await adapter.emitListening('http://localhost:3000/');

		assert.equal(infoSpy.mock.calls.length, 0);
		assert.deepEqual(receivedRoutes, []);
		infoSpy.mockRestore();
	});
});
