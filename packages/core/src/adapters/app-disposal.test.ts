import assert from 'node:assert/strict';
import type { Server as NodeHttpServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.ts';
import { EcopagesApp } from './node/create-app.ts';
import type { NodeServerAdapterResult } from './node/server-adapter.ts';
import type { NodeRuntimeServeOptions } from './node/runtime-host.ts';
import type { RuntimeHost } from './shared/runtime/runtime-host.ts';

function disposalAppConfig() {
	return { appRuntime: { origin: 'http://localhost:3000', hmr: null } } as never;
}

const defaultCliArgs = {
	preview: false,
	build: false,
	start: true,
	dev: false,
	serveOnly: false,
	port: undefined,
	hostname: undefined,
};

function createMockServerAdapterResult(dispose = vi.fn().mockResolvedValue(undefined)) {
	return {
		getServerOptions: () => ({ port: 3000, hostname: 'localhost' }),
		completeInitialization: async () => {},
		handleRequest: async () => new Response(null, { status: 204 }),
		buildStatic: async () => {},
		servePreviewOnly: async () => {},
		applyBoundPort: () => {},
		dispose,
	} as NodeServerAdapterResult;
}

function createTestApp(
	runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions>,
	createServerAdapter: () => Promise<NodeServerAdapterResult>,
): EcopagesApp {
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
		const runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const app = createTestApp(runtimeHost, async () => createMockServerAdapterResult(dispose));

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
		const runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> = {
			start: vi.fn().mockResolvedValue(server),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const app = createTestApp(runtimeHost, async () => createMockServerAdapterResult(dispose));
		await app.start();

		await (async () => {
			await using disposableApp = app;
			assert.equal(disposableApp, app);
		})();

		expect(runtimeStop).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('does not dispose the preview server immediately after preview build', async () => {
		const runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> = {
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
				createServerAdapter: async () => ({
					...createMockServerAdapterResult(dispose),
					buildStatic,
				}),
			},
		);

		await app.start();

		expect(buildStatic).toHaveBeenCalledWith({ preview: true });
		expect(dispose).not.toHaveBeenCalled();
		expect(runtimeHost.stop).not.toHaveBeenCalled();
	});

	it('can restart after stop and dispose the next server', async () => {
		const firstServer = { id: 'first-node-server' } as unknown as NodeHttpServer;
		const secondServer = { id: 'second-node-server' } as unknown as NodeHttpServer;
		const runtimeStop = vi.fn().mockResolvedValue(undefined);
		const runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> = {
			start: vi.fn().mockResolvedValueOnce(firstServer).mockResolvedValueOnce(secondServer),
			stop: runtimeStop,
			getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
		};
		const dispose = vi.fn().mockResolvedValue(undefined);
		const createServerAdapter = vi.fn(async () => createMockServerAdapterResult(dispose));
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
});
