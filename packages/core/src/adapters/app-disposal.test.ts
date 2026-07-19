import assert from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.ts';
import { BunEcopagesApp } from './bun/create-app.ts';
import type { BunServerAdapterResult } from './bun/server-adapter.ts';
import { NodeEcopagesApp } from './node/create-app.ts';
import type { NodeServerAdapterResult } from './node/server-adapter.ts';
import type { NodeServerAdapterParams } from './node/server-adapter.ts';
import type { RuntimeHost } from './shared/runtime/runtime-host.ts';

function createMockServerAdapterResult(dispose = vi.fn().mockResolvedValue(undefined)) {
	return {
		getServerOptions: () => ({ port: 3000, hostname: 'localhost' }),
		completeInitialization: async () => {},
		handleRequest: async () => new Response(null, { status: 204 }),
		buildStatic: async () => {},
		servePreviewOnly: async () => {},
		attachUserWebSocketUpgrades: () => {},
		dispose,
	};
}

class TestNodeEcopagesApp extends NodeEcopagesApp {
	public readonly dispose = vi.fn().mockResolvedValue(undefined);
	public readonly buildStatic = vi.fn().mockResolvedValue(undefined);

	constructor(
		options: ConstructorParameters<typeof NodeEcopagesApp>[0],
		runtimeHost: RuntimeHost<unknown, { port?: number; hostname?: string }>,
	) {
		super(options, { runtimeHost: runtimeHost as never });
	}

	protected override async createServerAdapter(_params: NodeServerAdapterParams): Promise<NodeServerAdapterResult> {
		return {
			...createMockServerAdapterResult(this.dispose),
			buildStatic: this.buildStatic,
		} as NodeServerAdapterResult;
	}

	public setServerForTest(server: unknown): void {
		(this as unknown as { server: unknown }).server = server;
	}

	public setCliArgsForTest(cliArgs: Partial<typeof this.cliArgs>): void {
		this.cliArgs = {
			preview: false,
			build: false,
			start: false,
			dev: false,
			force: false,
			serveOnly: false,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
			...cliArgs,
		};
	}

	public async bindServerAdapterForTest(): Promise<void> {
		(this as unknown as { serverAdapter: NodeServerAdapterResult }).serverAdapter =
			await this.initializeServerAdapter();
	}
}

class TestBunEcopagesApp extends BunEcopagesApp {
	public readonly dispose = vi.fn().mockResolvedValue(undefined);
	public readonly buildStatic = vi.fn().mockResolvedValue(undefined);

	constructor(
		options: ConstructorParameters<typeof BunEcopagesApp>[0],
		runtimeHost: RuntimeHost<unknown, { port?: number; hostname?: string }>,
	) {
		super(options, {
			runtimeHost: runtimeHost as never,
		});
	}

	protected override async initializeServerAdapter(): Promise<BunServerAdapterResult> {
		return {
			...createMockServerAdapterResult(this.dispose),
			buildStatic: this.buildStatic,
		} as BunServerAdapterResult;
	}

	public setServerForTest(server: unknown): void {
		(this as unknown as { server: unknown }).server = server;
	}

	public setCliArgsForTest(cliArgs: Partial<typeof this.cliArgs>): void {
		this.cliArgs = {
			preview: false,
			build: false,
			start: false,
			dev: false,
			force: false,
			serveOnly: false,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
			...cliArgs,
		};
	}

	public async bindServerAdapterForTest(): Promise<void> {
		(this as unknown as { serverAdapter: BunServerAdapterResult }).serverAdapter =
			await this.initializeServerAdapter();
	}
}

describe('createApp async disposal', () => {
	it('exposes Symbol.asyncDispose on created apps', async () => {
		const app = await createApp({ appConfig: {} as never });
		expect(typeof app[Symbol.asyncDispose]).toBe('function');
	});

	it('cleans up with await using at scope exit', async () => {
		const app = await createApp({ appConfig: {} as never });
		const stopSpy = vi.spyOn(app, 'stop').mockResolvedValue(undefined);

		await (async () => {
			await using disposableApp = app;
			expect(disposableApp).toBe(app);
		})();

		expect(stopSpy).toHaveBeenCalledTimes(1);
		expect(stopSpy).toHaveBeenCalledWith(true);
	});
});

describe('NodeEcopagesApp disposal', () => {
	it('stops the runtime host once and disposes adapter resources', async () => {
		const server = { id: 'node-server' };
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestNodeEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);
		app.setServerForTest(server);
		await app.bindServerAdapterForTest();

		await app.stop();
		await app.stop();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(runtimeStop).toHaveBeenCalledWith(server, { force: true });
		expect(app.dispose).toHaveBeenCalledTimes(1);
	});

	it('cleans up with await using', async () => {
		const server = { id: 'node-server' };
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestNodeEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);
		app.setServerForTest(server);
		await app.bindServerAdapterForTest();

		await (async () => {
			await using disposableApp = app;
			assert.equal(disposableApp, app);
		})();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(app.dispose).toHaveBeenCalledTimes(1);
	});

	it('does not dispose the preview server immediately after preview build', async () => {
		const runtimeHost = {
			start: vi.fn(),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestNodeEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);
		app.setCliArgsForTest({ preview: true });

		await app.start();

		expect(app.buildStatic).toHaveBeenCalledWith({ preview: true, force: false });
		expect(app.dispose).not.toHaveBeenCalled();
		expect(runtimeHost.stop).not.toHaveBeenCalled();
	});

	it('can restart after stop and dispose the next server', async () => {
		const firstServer = { id: 'first-node-server' };
		const secondServer = { id: 'second-node-server' };
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValueOnce(firstServer).mockResolvedValueOnce(secondServer),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestNodeEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);

		await app.start();
		await app.stop();
		await app.start();
		await app.stop();

		expect(runtimeStop).toHaveBeenCalledTimes(2);
		expect(runtimeStop).toHaveBeenNthCalledWith(1, firstServer, { force: true });
		expect(runtimeStop).toHaveBeenNthCalledWith(2, secondServer, { force: true });
		expect(app.dispose).toHaveBeenCalledTimes(2);
	});
});

describe('BunEcopagesApp disposal', () => {
	it('stops the runtime host once and disposes adapter resources', async () => {
		const server = { id: 'bun-server', stop: vi.fn() };
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestBunEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);
		app.setServerForTest(server);
		await app.bindServerAdapterForTest();

		await app.stop();
		await app.stop();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(runtimeStop).toHaveBeenCalledWith(server, { force: true });
		expect(app.dispose).toHaveBeenCalledTimes(1);
	});

	it('cleans up with await using', async () => {
		const server = { id: 'bun-server', stop: vi.fn() };
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestBunEcopagesApp({ appConfig: { runtime: {} } as never }, runtimeHost);
		app.setServerForTest(server);
		await app.bindServerAdapterForTest();

		await (async () => {
			await using disposableApp = app;
			assert.equal(disposableApp, app);
		})();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(app.dispose).toHaveBeenCalledTimes(1);
	});

	it('builds preview without starting a temporary runtime server', async () => {
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost = {
			start: vi.fn().mockResolvedValue({ id: 'bun-preview-runtime', stop: vi.fn() }),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};

		const app = new TestBunEcopagesApp(
			{ appConfig: { runtime: {}, integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }] } as never },
			runtimeHost,
		);
		app.setCliArgsForTest({ preview: true });

		await app.start();
		await app.stop();

		expect(runtimeHost.start).not.toHaveBeenCalled();
		expect(runtimeStop).not.toHaveBeenCalled();
		expect(app.buildStatic).toHaveBeenCalledWith({ preview: true, force: false });
		expect(app.dispose).toHaveBeenCalledTimes(1);
	});
});
