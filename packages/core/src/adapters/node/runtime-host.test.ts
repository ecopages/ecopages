import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { appLogger } from '../../global/app-logger.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';

describe('NodeRuntimeHost', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not log or report client aborts raised while sending the response', async () => {
		let requestHandler:
			((req: unknown, res: { statusCode: number; end: ReturnType<typeof vi.fn> }) => Promise<void>) | undefined;

		const requestBridge = {
			createWebRequest: vi.fn().mockReturnValue(new Request('http://localhost:3000')),
			sendNodeResponse: vi.fn().mockRejectedValue(new NodeClientAbortError()),
		};
		const serverFactory = vi.fn().mockImplementation((handler) => {
			requestHandler = handler;
			return {
				on: vi.fn(),
				once: vi.fn(),
				off: vi.fn(),
				listen: (_port: number, _hostname: string, callback: () => void) => callback(),
				close: (_callback: (error?: Error | null) => void) => undefined,
				closeAllConnections: () => undefined,
				address: () => ({ address: '127.0.0.1', port: 3000, family: 'IPv4' }),
			};
		});
		const loggerSpy = vi.spyOn(appLogger, 'error');
		const host = new NodeRuntimeHost(requestBridge as never, serverFactory as never);

		await host.start({
			hostname: 'localhost',
			port: 3000,
			handleRequest: async () => new Response('ok'),
		});

		const res = { statusCode: 200, end: vi.fn() };
		await requestHandler?.({ url: '/', method: 'GET', headers: {} }, res);

		expect(loggerSpy).not.toHaveBeenCalled();
		expect(res.end).not.toHaveBeenCalled();
	});

	it('preserves the configured hostname in the reported runtime origin', () => {
		const host = new NodeRuntimeHost({} as never);
		const server = {
			address: () => ({ address: '::1', port: 3000, family: 'IPv6' }),
		};

		expect(
			host.getOrigin(server as never, {
				hostname: 'localhost',
				port: 3000,
			}),
		).toBe('http://localhost:3000');
	});

	it('rejects when listen fails with EADDRINUSE', async () => {
		const requestBridge = {
			createWebRequest: vi.fn(),
			sendNodeResponse: vi.fn(),
		};
		const serverFactory = vi.fn().mockImplementation(() => {
			return {
				on: vi.fn(),
				once: vi.fn().mockImplementation((event: string, handler: (error: Error) => void) => {
					if (event === 'error') {
						handler(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));
					}
				}),
				off: vi.fn(),
				listen: vi.fn(),
				close: vi.fn(),
				closeAllConnections: vi.fn(),
				address: vi.fn(),
			};
		});
		const host = new NodeRuntimeHost(requestBridge as never, serverFactory as never);

		await expect(
			host.start({ hostname: 'localhost', port: 3000, handleRequest: async () => new Response('ok') }),
		).rejects.toMatchObject({ code: 'EADDRINUSE' });
	});

	it('stops while a WebSocket client is still connected', async () => {
		const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const server = await host.start({
			hostname: '127.0.0.1',
			port: 0,
			handleRequest: async () => new Response('ok'),
		});
		const origin = host.getOrigin(server, { hostname: '127.0.0.1' });
		const onClose = vi.fn();
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: origin,
			websocketHandlers: new Map([['/ws', { onClose }]]),
		});
		const client = new WebSocket(`${origin.replace('http', 'ws')}/ws`);
		await once(client, 'open');
		const clientClosed = once(client, 'close');

		await host.stop(server);
		await clientClosed;

		expect(server.listening).toBe(false);
		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	}, 2000);

	describe('on a port already taken on localhost', () => {
		const handleRequest = async () => new Response('ok');
		const isBunInstalled = spawnSync('bun', ['--version']).status === 0;
		let taken: Server | undefined;

		async function takeLocalhostPort(): Promise<number> {
			taken = createServer();
			await new Promise<void>((resolve) => taken?.listen(0, 'localhost', resolve));
			return (taken.address() as AddressInfo).port;
		}

		afterEach(async () => {
			const server = taken;
			taken = undefined;
			if (server) await new Promise((resolve) => server.close(resolve));
		});

		it('rejects with EADDRINUSE', async () => {
			const port = await takeLocalhostPort();
			const host = new NodeRuntimeHost(new NodeHttpRequestBridge());

			await expect(host.start({ hostname: 'localhost', port, handleRequest })).rejects.toMatchObject({
				code: 'EADDRINUSE',
			});
		});

		it('falls back to another port when fallback is allowed', async () => {
			const port = await takeLocalhostPort();
			const host = new NodeRuntimeHost(new NodeHttpRequestBridge());

			const binding = await bindRuntimeServer(host, {
				serveOptions: { hostname: 'localhost', port, handleRequest },
				allowPortFallback: true,
				usePortManager: true,
			});
			await host.stop(binding.server);

			expect(binding.port).not.toBe(port);
		});

		it('rejects with EADDRINUSE when the port is pinned', async () => {
			const port = await takeLocalhostPort();
			const host = new NodeRuntimeHost(new NodeHttpRequestBridge());

			await expect(
				bindRuntimeServer(host, {
					serveOptions: { hostname: 'localhost', port, handleRequest },
					allowPortFallback: false,
					usePortManager: true,
				}),
			).rejects.toMatchObject({ code: 'EADDRINUSE' });
		});

		it.skipIf(!isBunInstalled)(
			'rejects with EADDRINUSE under Bun',
			() => {
				const hostModule = fileURLToPath(new URL('./runtime-host.ts', import.meta.url));
				const bridgeModule = fileURLToPath(new URL('./http-request-bridge.ts', import.meta.url));
				const script = `
				import { createServer } from 'node:http';
				import { NodeRuntimeHost } from ${JSON.stringify(hostModule)};
				import { NodeHttpRequestBridge } from ${JSON.stringify(bridgeModule)};
				const taken = createServer();
				await new Promise((resolve) => taken.listen(0, 'localhost', resolve));
				const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
				const outcome = await host
					.start({ hostname: 'localhost', port: taken.address().port, handleRequest: async () => new Response('ok') })
					.then(() => 'bound', (error) => error.code);
				console.log(outcome);
				process.exit(0);
			`;

				const result = spawnSync('bun', ['--eval', script], { encoding: 'utf8', timeout: 10_000 });

				expect(result.stdout.trim()).toBe('EADDRINUSE');
			},
			15_000,
		);
	});
});
