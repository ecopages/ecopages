import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { appLogger } from '../../global/app-logger.ts';
import type { ApiHandler, RenderContext } from '../../types/contracts.ts';
import { ApiRequestPipeline, compileApiRoutes } from '../shared/http/api-request-pipeline.ts';
import { defineQuery } from '../shared/http/define-api-handler.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';
import { createHostPolicy } from '../shared/http/host-policy.ts';
import { anyHostPolicy } from './host-policy.fixture.ts';
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
			hostPolicy: anyHostPolicy,
			hostname: 'localhost',
			port: 3000,
			handleRequest: async () => new Response('ok'),
		});

		const res = { statusCode: 200, end: vi.fn() };
		await requestHandler?.({ url: '/', method: 'GET', headers: { host: 'localhost:3000' } }, res);

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
			host.start({
				hostname: 'localhost',
				port: 3000,
				hostPolicy: anyHostPolicy,
				handleRequest: async () => new Response('ok'),
			}),
		).rejects.toMatchObject({ code: 'EADDRINUSE' });
	});

	it('gives the handler the host the visitor used, and the forwarded one only when the proxy is trusted', async () => {
		const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const seen = async (trustProxy: boolean) => {
			const server = await host.start({
				hostname: '127.0.0.1',
				port: 0,
				trustProxy,
				hostPolicy: anyHostPolicy,
				handleRequest: async (request) => new Response(request.url),
			});
			try {
				const { port } = server.address() as AddressInfo;
				return await new Promise<string>((resolve, reject) => {
					httpRequest(
						{
							host: '127.0.0.1',
							port,
							path: '/probe',
							headers: {
								Host: 'shop.example',
								'X-Forwarded-Host': 'proxy.example',
								'X-Forwarded-Proto': 'https',
							},
						},
						(res) => {
							const chunks: Buffer[] = [];
							res.on('data', (chunk: Buffer) => chunks.push(chunk));
							res.on('end', () => resolve(Buffer.concat(chunks).toString()));
						},
					)
						.on('error', reject)
						.end();
				});
			} finally {
				await host.stop(server);
			}
		};

		expect(await seen(false)).toBe('http://shop.example/probe');
		expect(await seen(true)).toBe('https://proxy.example/probe');
	});

	describe('host policy', () => {
		const hostPolicy = createHostPolicy({
			allowedHosts: ['shop.example', '*.shop.example'],
			baseUrl: 'https://shop.example',
			development: false,
		});

		async function withServer<T>(
			options: { trustProxy?: boolean; hostPolicy?: typeof hostPolicy },
			run: (
				send: (headers: Record<string, string>, path?: string) => Promise<{ status: number; body: string }>,
				sendRaw: (text: string) => Promise<string>,
			) => Promise<T>,
		): Promise<{ result: T; handled: string[] }> {
			const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
			const handled: string[] = [];
			const server = await host.start({
				hostname: '127.0.0.1',
				port: 0,
				hostPolicy: anyHostPolicy,
				...options,
				handleRequest: async (request) => {
					handled.push(request.url);
					return new Response(request.url);
				},
			});
			const { port } = server.address() as AddressInfo;
			const send = (headers: Record<string, string>, path = '/probe') =>
				new Promise<{ status: number; body: string }>((resolve, reject) => {
					httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
						const chunks: Buffer[] = [];
						res.on('data', (chunk: Buffer) => chunks.push(chunk));
						res.on('end', () =>
							resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
						);
					})
						.on('error', reject)
						.end();
				});
			const sendRaw = (text: string) =>
				new Promise<string>((resolve, reject) => {
					const socket = connect({ host: '127.0.0.1', port }, () => socket.write(text));
					const chunks: Buffer[] = [];
					socket.on('data', (chunk: Buffer) => chunks.push(chunk));
					socket.on('close', () => resolve(Buffer.concat(chunks).toString()));
					socket.on('error', reject);
				});
			try {
				return { result: await run(send, sendRaw), handled };
			} finally {
				await host.stop(server);
			}
		}

		it('answers HTTP 400 for a host the app does not serve, before the handler runs', async () => {
			const { result, handled } = await withServer({ hostPolicy }, async (send) => [
				await send({ Host: 'evil.example' }),
				await send({ Host: 'evil.example:3000' }),
				await send({ Host: 'shop.example.evil.example' }),
			]);

			expect(result.map((response) => response.status)).toEqual([400, 400, 400]);
			expect(handled).toEqual([]);
		});

		it('passes an allowed host, with a port or a wildcard subdomain', async () => {
			const { result, handled } = await withServer({ hostPolicy }, async (send) => [
				await send({ Host: 'shop.example' }),
				await send({ Host: 'shop.example:8080' }),
				await send({ Host: 'eu.shop.example' }),
			]);

			expect(result.map((response) => response.status)).toEqual([200, 200, 200]);
			expect(handled).toEqual([
				'http://shop.example/probe',
				'http://shop.example:8080/probe',
				'http://eu.shop.example/probe',
			]);
		});

		it('refuses a request without a usable Host', async () => {
			const { result, handled } = await withServer({ hostPolicy }, async (send, sendRaw) => ({
				malformed: await send({ Host: 'shop.example/evil' }),
				missing: await sendRaw('GET /probe HTTP/1.0\r\n\r\n'),
			}));

			expect(result.malformed.status).toBe(400);
			expect(result.missing).toMatch(/^HTTP\/1\.1 400 /u);
			expect(handled).toEqual([]);
		});

		it('checks a forwarded host only when the proxy is trusted', async () => {
			const headers = { Host: 'shop.example', 'X-Forwarded-Host': 'evil.example' };

			const untrusted = await withServer({ hostPolicy, trustProxy: false }, (send) => send(headers));
			const trusted = await withServer({ hostPolicy, trustProxy: true }, async (send) => [
				await send(headers),
				await send({ Host: 'internal:3000', 'X-Forwarded-Host': 'shop.example' }),
			]);

			expect(untrusted.result.status).toBe(200);
			expect(untrusted.result.body).toBe('http://shop.example/probe');
			expect(trusted.result.map((response) => response.status)).toEqual([400, 200]);
			expect(trusted.handled).toEqual(['http://shop.example/probe']);
		});

		it('checks the host the request URL carries, not one named by the request target', async () => {
			const { result, handled } = await withServer({ hostPolicy }, async (send) => [
				await send({ Host: 'shop.example' }, '//evil.example/probe'),
				await send({ Host: 'shop.example' }, 'http://evil.example/probe'),
				await send({ Host: 'evil.example' }, 'http://shop.example/probe'),
			]);

			expect(result.map((response) => response.status)).toEqual([200, 200, 400]);
			expect(handled).toEqual(['http://shop.example//evil.example/probe', 'http://shop.example/probe']);
		});

		it('serves every host when no policy is given', async () => {
			const { result } = await withServer({}, (send) => send({ Host: 'evil.example' }));

			expect(result.status).toBe(200);
		});
	});

	it('delivers a QUERY request body to the handler through the bound server', async () => {
		const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const pipeline = new ApiRequestPipeline({
			getRenderContext: () => ({}) as RenderContext,
			getCacheService: () => null,
		});
		const apiHandlers: ApiHandler[] = [
			defineQuery({
				path: '/search',
				schema: { body: z.object({ term: z.string() }) },
				handler: ({ body, request }) =>
					Response.json({ method: request.method, term: (body as { term: string }).term }),
			}),
		];
		const server = await host.start({
			hostPolicy: anyHostPolicy,
			hostname: '127.0.0.1',
			port: 0,
			handleRequest: async (request) =>
				(await pipeline.tryHandle(request, compileApiRoutes(apiHandlers), undefined)) ??
				new Response(null, { status: 404 }),
		});

		try {
			const { port } = server.address() as AddressInfo;
			const body = JSON.stringify({ term: 'ecopages' });
			const received = await new Promise<{ status: number; text: string }>((resolve, reject) => {
				httpRequest(
					{
						host: '127.0.0.1',
						port,
						path: '/search',
						method: 'QUERY',
						headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
					},
					(res) => {
						const chunks: Buffer[] = [];
						res.on('data', (chunk: Buffer) => chunks.push(chunk));
						res.on('end', () =>
							resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString() }),
						);
					},
				)
					.on('error', reject)
					.end(body);
			});

			expect(received.status).toBe(200);
			expect(JSON.parse(received.text)).toEqual({ method: 'QUERY', term: 'ecopages' });
		} finally {
			await host.stop(server);
		}
	});

	it('stops while a WebSocket client is still connected', async () => {
		const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const server = await host.start({
			hostPolicy: anyHostPolicy,
			hostname: '127.0.0.1',
			port: 0,
			handleRequest: async () => new Response('ok'),
		});
		const origin = host.getOrigin(server, { hostname: '127.0.0.1' });
		const onClose = vi.fn();
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: origin,
			hostPolicy: anyHostPolicy,
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

	it('refuses a WebSocket handshake from a page of another site with 403, and lets the own origin and a client without Origin connect', async () => {
		const host = new NodeRuntimeHost(new NodeHttpRequestBridge());
		const server = await host.start({
			hostname: '127.0.0.1',
			port: 0,
			hostPolicy: anyHostPolicy,
			handleRequest: async () => new Response('ok'),
		});
		const origin = host.getOrigin(server, { hostname: '127.0.0.1' });
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: origin,
			hostPolicy: anyHostPolicy,
			websocketHandlers: new Map([['/ws', {}]]),
		});
		const handshake = (headers: Record<string, string>) =>
			new Promise<number | 'open'>((resolve, reject) => {
				const client = new WebSocket(`${origin.replace('http', 'ws')}/ws`, { headers });
				client.on('open', () => {
					resolve('open');
					client.close();
				});
				client.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
				client.on('error', reject);
			});

		try {
			expect(await handshake({ Origin: 'https://evil.example' })).toBe(403);
			expect(await handshake({ Origin: 'null' })).toBe(403);
			expect(await handshake({ Origin: origin })).toBe('open');
			expect(await handshake({})).toBe('open');
		} finally {
			await host.stop(server);
		}
	});

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

			await expect(
				host.start({ hostname: 'localhost', port, hostPolicy: anyHostPolicy, handleRequest }),
			).rejects.toMatchObject({
				code: 'EADDRINUSE',
			});
		});

		it('falls back to another port when fallback is allowed', async () => {
			const port = await takeLocalhostPort();
			const host = new NodeRuntimeHost(new NodeHttpRequestBridge());

			const binding = await bindRuntimeServer(host, {
				serveOptions: { hostname: 'localhost', port, hostPolicy: anyHostPolicy, handleRequest },
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
					serveOptions: { hostname: 'localhost', port, hostPolicy: anyHostPolicy, handleRequest },
					allowPortFallback: false,
					usePortManager: true,
				}),
			).rejects.toMatchObject({ code: 'EADDRINUSE' });
		});

		it.skipIf(!isBunInstalled)(
			'rejects with EADDRINUSE under Bun',
			() => {
				const hostModule = path.fromFileUrl(new URL('./runtime-host.ts', import.meta.url));
				const bridgeModule = path.fromFileUrl(new URL('./http-request-bridge.ts', import.meta.url));
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
