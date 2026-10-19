import { describe, expect, it, vi } from 'vitest';
import type { Server as NodeHttpServer } from 'node:http';
import type { RuntimeHost } from '../../node/runtime-host.ts';
import { bindRuntimeServer } from './bind-runtime-server.ts';

type TestServer = NodeHttpServer & { port: number };

const handleRequest = async () => new Response(null);

function createRuntimeHost(actualPort?: number): RuntimeHost {
	return {
		start: vi.fn(async (serveOptions) => ({ port: actualPort ?? Number(serveOptions.port) }) as TestServer),
		stop: vi.fn(async () => {}),
		getOrigin: vi.fn((server: TestServer, serveOptions) => {
			return `http://${serveOptions.hostname ?? 'localhost'}:${server.port}`;
		}),
	};
}

describe('bindRuntimeServer', () => {
	it('returns one coherent binding result when PortManager owns startup', async () => {
		const runtimeHost = createRuntimeHost();
		const serveOptions = { hostname: '127.0.0.1', port: 3000, handleRequest };

		const result = await bindRuntimeServer(runtimeHost, {
			serveOptions,
			allowPortFallback: true,
			usePortManager: true,
		});

		expect(result).toEqual({
			server: { port: 3000 },
			port: 3000,
			runtimeOrigin: 'http://127.0.0.1:3000',
		});
		expect(runtimeHost.start).toHaveBeenCalledOnce();
	});

	it('reports the host-assigned port when PortManager is disabled', async () => {
		const runtimeHost = createRuntimeHost(4317);

		const result = await bindRuntimeServer(runtimeHost, {
			serveOptions: { hostname: 'localhost', port: 0, handleRequest },
			allowPortFallback: false,
			usePortManager: false,
		});

		expect(result.port).toBe(4317);
		expect(result.runtimeOrigin).toBe('http://localhost:4317');
	});

	it('returns the server and origin from the fallback port', async () => {
		const collision = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
		const runtimeHost: RuntimeHost = {
			start: vi
				.fn()
				.mockRejectedValueOnce(collision)
				.mockRejectedValueOnce(collision)
				.mockResolvedValueOnce({ port: 3001 }),
			stop: vi.fn(async () => {}),
			getOrigin: vi.fn((server: TestServer, serveOptions) => {
				return `http://${serveOptions.hostname ?? 'localhost'}:${server.port}`;
			}),
		};

		const result = await bindRuntimeServer(runtimeHost, {
			serveOptions: { hostname: 'localhost', port: 3000, handleRequest },
			allowPortFallback: true,
			usePortManager: true,
		});

		expect(result).toEqual({
			server: { port: 3001 },
			port: 3001,
			runtimeOrigin: 'http://localhost:3001',
		});
		expect(runtimeHost.start).toHaveBeenCalledTimes(3);
	});
});
