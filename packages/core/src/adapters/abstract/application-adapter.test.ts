import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteHandler,
	type RouteGroupDefinition,
} from './application-adapter.ts';
import type { ApiHandlerContext, ViewLoader } from '../../types/public-types.ts';
import {
	setHostModuleLoader,
	clearHostModuleLoader,
} from '../../services/module-loading/host-module-loader-registry.ts';

class TestApplicationAdapter extends AbstractApplicationAdapter<ApplicationAdapterOptions, unknown, Request> {
	public getCliArgsSnapshot() {
		return this.cliArgs;
	}

	public getAppModuleLoader() {
		return this.appConfig.runtime?.appModuleLoader;
	}

	public getHostModuleLoader() {
		return this.appConfig.runtime?.hostModuleLoader;
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

	override static<P>(_path: string, _loader: ViewLoader<P>): this {
		return this;
	}

	protected async initializeServerAdapter(): Promise<void> {
		return;
	}

	async fetch(_request: Request): Promise<Response> {
		return new Response(null, { status: 204 });
	}

	start(): Promise<void> {
		return Promise.resolve();
	}
}

afterEach(() => {
	clearHostModuleLoader();
	delete process.env.NODE_ENV;
});

describe('application adapter runtime bootstrap', () => {
	it('derives embedded cli args from explicit runtime options', () => {
		process.env.NODE_ENV = 'development';
		const adapter = new TestApplicationAdapter({
			appConfig: {
				runtime: {},
			} as ApplicationAdapterOptions['appConfig'],
			runtime: {
				embedded: true,
			},
		});

		assert.deepEqual(adapter.getCliArgsSnapshot(), {
			preview: false,
			build: false,
			start: false,
			dev: true,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
		});
		assert.equal(adapter.getAppModuleLoader()?.owner, 'bun');
	});

	it('auto-detects the host module loader in embedded mode from registry', async () => {
		process.env.NODE_ENV = 'development';
		let importedId: string | undefined;
		const filePath = import.meta.filename;
		setHostModuleLoader(async (id) => {
			importedId = id;
			return { id };
		});

		const adapter = new TestApplicationAdapter({
			appConfig: {
				runtime: {},
			} as ApplicationAdapterOptions['appConfig'],
			runtime: {
				embedded: true,
			},
		});

		const appModuleLoader = adapter.getAppModuleLoader();
		const hostModuleLoader = adapter.getHostModuleLoader();

		assert.ok(appModuleLoader);
		assert.ok(hostModuleLoader);
		assert.equal(appModuleLoader?.owner, 'host');
		assert.deepEqual(await hostModuleLoader?.('/virtual:entry'), { id: '/virtual:entry' });
		assert.deepEqual(
			await appModuleLoader?.importModule({
				filePath,
				rootDir: '/app',
				outdir: '/app/.eco/.server-modules',
			}),
			{ id: importedId },
		);
		assert.match(importedId ?? '', /application-adapter\.test\.ts\?update=/);
	});
});
