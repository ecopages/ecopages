import assert from 'node:assert/strict';
import type { Server as NodeHttpServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.ts';
import { EcopagesApp } from './node/create-app.ts';
import type { NodeServerAdapter } from './node/server-adapter.ts';
import type { RuntimeHost } from './node/runtime-host.ts';

function disposalAppConfig() {
	return { appRuntime: { origin: 'http://localhost:3000', hmr: null } } as never;
}

const defaultCliArgs = {
	preview: false,
	build: false,
	start: true,
	dev: false,
	serveOnly: false,
	keepGoing: false,
	port: undefined,
	hostname: undefined,
};

function createMockServerAdapter(dispose = vi.fn().mockResolvedValue(undefined)) {
	return {
		initialize: async () => {},
		getServerOptions: () => ({ port: 3000, hostname: 'localhost' }),
		completeInitialization: async () => {},
		handleRequest: async () => new Response(null, { status: 204 }),
		buildStatic: async () => {},
		servePreviewOnly: async () => {},
		applyBoundPort: () => {},
		listStaticGenerationRoutes: async () => [],
		dispose,
	} as unknown as NodeServerAdapter;
}

function createTestApp(runtimeHost: RuntimeHost, createServerAdapter: () => Promise<NodeServerAdapter>): EcopagesApp {
	return new EcopagesApp(
		{ appConfig: disposalAppConfig(), cliArgs: defaultCliArgs },
		{ runtimeHost, createServerAdapter },
	);
}

describe('createApp async disposal', () => {
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

describe('EcopagesApp disposal', () => {
	it('stops the runtime host once and disposes adapter resources', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const app = createTestApp(runtimeHost, async () => createMockServerAdapter(dispose));

		await app.start();
		await app.stop();
		await app.stop();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(runtimeStop).toHaveBeenCalledWith(server, { force: true });
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('cleans up with await using', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const app = createTestApp(runtimeHost, async () => createMockServerAdapter(dispose));
		await app.start();

		await (async () => {
			await using disposableApp = app;
			assert.equal(disposableApp, app);
		})();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('does not dispose the preview server immediately after preview build', async () => {
		const runtimeHost: RuntimeHost = {
			start: vi.fn(),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const buildStatic = vi.fn().mockResolvedValue(undefined);
		const dispose = vi.fn().mockResolvedValue(undefined);
		const app = new EcopagesApp(
			{
				appConfig: disposalAppConfig(),
				cliArgs: { ...defaultCliArgs, preview: true },
			},
			{
				runtimeHost,
				createServerAdapter: async () =>
					({
						...createMockServerAdapter(dispose),
						buildStatic,
					}) as unknown as NodeServerAdapter,
			},
		);

		await app.start();

		expect(buildStatic).toHaveBeenCalledWith({ preview: true, keepGoing: false });
		expect(dispose).not.toHaveBeenCalled();
		expect(runtimeHost.stop).not.toHaveBeenCalled();
	});

	it('can restart after stop and dispose the next server', async () => {
		const firstServer = { id: 'first-node-server' } as unknown as NodeHttpServer;
		const secondServer = { id: 'second-node-server' } as unknown as NodeHttpServer;
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValueOnce(firstServer).mockResolvedValueOnce(secondServer),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const createServerAdapter = vi.fn(async () => createMockServerAdapter(dispose));
		const app = createTestApp(runtimeHost, createServerAdapter);

		await app.start();
		await app.stop();
		await app.start();
		await app.stop();

		expect(runtimeStop).toHaveBeenCalledTimes(2);
		expect(runtimeStop).toHaveBeenNthCalledWith(1, firstServer, { force: true });
		expect(runtimeStop).toHaveBeenNthCalledWith(2, secondServer, { force: true });
		expect(createServerAdapter).toHaveBeenCalledTimes(2);
		expect(dispose).toHaveBeenCalledTimes(2);
	});

	it('reinitializes the request pipeline when fetch follows stop', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		let generation = 0;
		const createServerAdapter = vi.fn(async () => {
			generation += 1;
			const adapter = createMockServerAdapter();
			return {
				...adapter,
				handleRequest: async () => new Response(`generation ${generation}`),
			} as unknown as NodeServerAdapter;
		});
		const app = createTestApp(runtimeHost, createServerAdapter);

		await app.start();
		await app.stop();
		const response = await app.fetch(new Request('http://localhost:3000/'));

		expect(await response.text()).toBe('generation 2');
		expect(createServerAdapter).toHaveBeenCalledTimes(2);
	});

	it('shares one startup when start is called concurrently', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const createServerAdapter = vi.fn(async () => createMockServerAdapter());
		const app = createTestApp(runtimeHost, createServerAdapter);

		await Promise.all([app.start(), app.start()]);

		expect(createServerAdapter).toHaveBeenCalledTimes(1);
		expect(runtimeHost.start).toHaveBeenCalledTimes(1);
	});

	it('stops a server that finishes binding after stop() was called', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const binding = Promise.withResolvers<NodeHttpServer>();
		const runtimeHost: RuntimeHost = {
			start: vi.fn(() => binding.promise),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const completeInitialization = vi.fn().mockResolvedValue(undefined);
		const app = createTestApp(
			runtimeHost,
			async () =>
				({
					...createMockServerAdapter(dispose),
					completeInitialization,
				}) as unknown as NodeServerAdapter,
		);

		const started = app.start();
		await vi.waitFor(() => expect(runtimeHost.start).toHaveBeenCalledOnce());
		const stopped = app.stop();
		binding.resolve(server);

		await expect(started).resolves.toBeUndefined();
		await stopped;
		await app.stop();

		expect(completeInitialization).not.toHaveBeenCalled();
		expect(runtimeHost.stop).toHaveBeenCalledExactlyOnceWith(server, { force: true });
		expect(dispose).toHaveBeenCalledOnce();
	});

	it('does not restart when stop() is called while the adapter initializes', async () => {
		const initialized = Promise.withResolvers<void>();
		const runtimeHost: RuntimeHost = {
			start: vi.fn(),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const createServerAdapter = vi.fn(
			async () =>
				({
					...createMockServerAdapter(dispose),
					initialize: () => initialized.promise,
				}) as unknown as NodeServerAdapter,
		);
		const app = createTestApp(runtimeHost, createServerAdapter);

		const started = app.start();
		await vi.waitFor(() => expect(createServerAdapter).toHaveBeenCalledOnce());
		const stopped = app.stop();
		initialized.resolve();

		await expect(started).resolves.toBeUndefined();
		await stopped;

		expect(createServerAdapter).toHaveBeenCalledOnce();
		expect(runtimeHost.start).not.toHaveBeenCalled();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it('stops a bound server when watch-session startup fails', async () => {
		const server = { id: 'node-server' } as unknown as NodeHttpServer;
		const runtimeHost: RuntimeHost = {
			start: vi.fn().mockResolvedValue(server),
			stop: vi.fn().mockResolvedValue(undefined),
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const firstDispose = vi.fn().mockResolvedValue(undefined);
		let generation = 0;
		const createServerAdapter = vi.fn(async () => {
			generation += 1;
			const adapter = createMockServerAdapter(firstDispose);
			return {
				...adapter,
				completeInitialization:
					generation === 1 ? vi.fn().mockRejectedValue(new Error('watcher failed')) : async () => {},
				handleRequest: async () => new Response(`generation ${generation}`),
			} as unknown as NodeServerAdapter;
		});
		const app = createTestApp(runtimeHost, createServerAdapter);

		await expect(app.start()).rejects.toThrow('watcher failed');
		const response = await app.fetch(new Request('http://localhost:3000/'));

		expect(runtimeHost.stop).toHaveBeenCalledWith(server, { force: true });
		expect(firstDispose).toHaveBeenCalledOnce();
		expect(await response.text()).toBe('generation 2');
	});
});
