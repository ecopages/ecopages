import { EventEmitter } from 'node:events';
import { createServer, type Server as NodeHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { parseSearchParams } from '../../../router/server/parse-search-params.ts';
import type { EcopagesSocket, EcopagesWebSocketHandler } from '../../../types/contracts.ts';
import { createHostPolicy } from '../http/host-policy.ts';
import { anyHostPolicy } from '../../node/host-policy.fixture.ts';
import { attachNodeHttpWebSocketUpgrades } from './node-http-websocket-upgrades.ts';

function emitUpgrade(server: EventEmitter, url: string) {
	const socket = { destroy: vi.fn(), end: vi.fn() };
	server.emit('upgrade', { url, headers: { host: 'localhost:3000' } }, socket, Buffer.alloc(0));
	return socket;
}

describe('attachNodeHttpWebSocketUpgrades', () => {
	const hmrPreflight = (req: { url?: string }) => req.url === '/_hmr';

	function attach(websocketHandlers = new Map<string, EcopagesWebSocketHandler>()) {
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://localhost:3000',
			hostPolicy: anyHostPolicy,
			websocketHandlers,
			preflight: hmrPreflight,
		});
		return server;
	}

	it('destroys unmatched upgrades and leaves the HMR path to the preflight', () => {
		const server = attach();

		expect(emitUpgrade(server, '/other').destroy).toHaveBeenCalledOnce();
		expect(emitUpgrade(server, '/_hmr').destroy).not.toHaveBeenCalled();
	});

	it('answers a malformed encoded path with HTTP 400', () => {
		const server = attach(new Map([['/ws/:room', { onConnect: () => {} }]]));
		const socket = emitUpgrade(server, '/ws/%E0%A4%A');

		expect(socket.end).toHaveBeenCalledWith(
			'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
		);
		expect(socket.destroy).not.toHaveBeenCalled();
	});
});

describe('attachNodeHttpWebSocketUpgrades request origin', () => {
	function upgradeUrl(trustProxy?: boolean | { host?: boolean; proto?: boolean }) {
		let url: string | undefined;
		const handler: EcopagesWebSocketHandler = {
			context: ({ request }) => {
				url = request.url;
				throw new Error('refuse after reading the URL');
			},
		};
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://127.0.0.1:3000',
			trustProxy,
			hostPolicy: anyHostPolicy,
			websocketHandlers: new Map([['/ws/:room', handler]]),
		});
		const socket = { destroy: vi.fn(), end: vi.fn(), write: vi.fn() };
		server.emit(
			'upgrade',
			{
				url: '/ws/lobby',
				method: 'GET',
				headers: { host: 'app.internal', 'x-forwarded-host': 'shop.example', 'x-forwarded-proto': 'https' },
			},
			socket,
			Buffer.alloc(0),
		);
		return vi.waitFor(() => {
			if (!url) throw new Error('context() has not run');
			return url;
		});
	}

	it('gives context() the Host the visitor used, and the forwarded headers only when trusted', async () => {
		expect(await upgradeUrl()).toBe('http://app.internal/ws/lobby');
		expect(await upgradeUrl(true)).toBe('https://shop.example/ws/lobby');
		expect(await upgradeUrl({ proto: true })).toBe('https://app.internal/ws/lobby');
	});
});

describe('attachNodeHttpWebSocketUpgrades host policy', () => {
	const hostPolicy = createHostPolicy({
		allowedHosts: ['shop.example'],
		baseUrl: 'https://shop.example',
		development: false,
	});

	function upgrade(headers: Record<string, string>, options: { trustProxy?: boolean; url?: string } = {}) {
		const preflight = vi.fn().mockReturnValue(false);
		const context = vi.fn().mockRejectedValue(new Error('refuse after the policy'));
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://127.0.0.1:3000',
			trustProxy: options.trustProxy,
			hostPolicy,
			websocketHandlers: new Map([['/ws/:room', { context }]]),
			preflight,
		});
		const socket = { destroy: vi.fn(), end: vi.fn(), write: vi.fn() };
		server.emit('upgrade', { url: options.url ?? '/ws/lobby', method: 'GET', headers }, socket, Buffer.alloc(0));
		return { socket, context, preflight };
	}

	const refusal = 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

	it('refuses an upgrade for a host the app does not serve, before the preflight and context()', () => {
		const { socket, context, preflight } = upgrade({ host: 'evil.example' });

		expect(socket.end).toHaveBeenCalledWith(refusal);
		expect(preflight).not.toHaveBeenCalled();
		expect(context).not.toHaveBeenCalled();
	});

	it('refuses an upgrade without a usable Host', () => {
		expect(upgrade({}).socket.end).toHaveBeenCalledWith(refusal);
		expect(upgrade({ host: 'shop.example/x' }).socket.end).toHaveBeenCalledWith(refusal);
	});

	it('passes an allowed host on to the preflight and context()', async () => {
		const { socket, context, preflight } = upgrade({ host: 'shop.example:8080' });

		expect(preflight).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(context).toHaveBeenCalledOnce());
		expect(socket.end).not.toHaveBeenCalledWith(refusal);
	});

	it('checks a forwarded host only when the proxy is trusted', () => {
		const headers = { host: 'shop.example', 'x-forwarded-host': 'evil.example' };

		expect(upgrade(headers).socket.end).not.toHaveBeenCalledWith(refusal);
		expect(upgrade(headers, { trustProxy: true }).socket.end).toHaveBeenCalledWith(refusal);
	});

	const forbidden = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

	it('refuses an upgrade from a page of another site with 403, before the preflight and context()', () => {
		for (const origin of ['http://evil.example', 'null', 'https://shop.example', 'http://shop.example:8080']) {
			const { socket, context, preflight } = upgrade({ host: 'shop.example', origin });

			expect(socket.end).toHaveBeenCalledWith(forbidden);
			expect(preflight).not.toHaveBeenCalled();
			expect(context).not.toHaveBeenCalled();
		}
	});

	it('refuses a cross-site page the HMR socket as well as the app sockets, since the preflight comes after the check', () => {
		const hmr = upgrade({ host: 'shop.example', origin: 'http://evil.example' }, { url: '/_hmr' });

		expect(hmr.socket.end).toHaveBeenCalledWith(forbidden);
		expect(hmr.preflight).not.toHaveBeenCalled();
	});

	it('lets a page of the checked origin and a client without Origin go on', async () => {
		const page = upgrade({ host: 'shop.example', origin: 'http://shop.example' });
		const client = upgrade({ host: 'shop.example' });

		expect(page.socket.end).not.toHaveBeenCalledWith(forbidden);
		expect(client.socket.end).not.toHaveBeenCalledWith(forbidden);
		expect(page.preflight).toHaveBeenCalledOnce();
		expect(client.preflight).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(client.context).toHaveBeenCalledOnce());
	});

	it('compares Origin with the forwarded origin only when the proxy is trusted', () => {
		const headers = {
			host: 'internal',
			'x-forwarded-host': 'shop.example',
			'x-forwarded-proto': 'https',
			origin: 'https://shop.example',
		};

		expect(upgrade(headers, { trustProxy: true }).socket.end).not.toHaveBeenCalledWith(forbidden);
		expect(upgrade({ ...headers, host: 'shop.example' }).socket.end).toHaveBeenCalledWith(forbidden);
	});

	it('does not match a route on a host named in the request target', () => {
		const { socket, context } = upgrade({ host: 'shop.example' }, { url: '//evil.example/ws/lobby' });

		expect(socket.destroy).toHaveBeenCalledOnce();
		expect(context).not.toHaveBeenCalled();
	});

	it('gives context() the checked host when the request target is an absolute URL on another host', async () => {
		const { context } = upgrade({ host: 'shop.example' }, { url: 'http://evil.example/ws/lobby' });

		await vi.waitFor(() => expect(context).toHaveBeenCalledOnce());
		expect(context.mock.calls[0]?.[0].request.url).toBe('http://shop.example/ws/lobby');
	});
});

describe('attachNodeHttpWebSocketUpgrades query parsing', () => {
	async function connectAndCaptureSearch(search: string) {
		const captured: { search?: EcopagesSocket['search'] } = {};
		const handler: EcopagesWebSocketHandler = {
			context: ({ search }) => {
				captured.search = search;
			},
		};
		const server = createServer();
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: 'http://localhost',
			hostPolicy: anyHostPolicy,
			websocketHandlers: new Map([['/ws/:room', handler]]),
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;
		const client = new WebSocket(`ws://127.0.0.1:${port}/ws/lobby${search}`);

		try {
			await new Promise<void>((resolve, reject) => {
				client.once('open', resolve);
				client.once('error', reject);
			});
		} finally {
			client.close();
			await new Promise((resolve) => server.close(resolve));
		}

		return captured.search;
	}

	it('exposes a repeated query key as an array, matching HTTP handlers', async () => {
		const query = '?tag=a&tag=b&name=x';
		const expected = parseSearchParams(new URL(`http://localhost/ws/lobby${query}`).searchParams);

		const search = await connectAndCaptureSearch(query);

		expect(search).toEqual({ tag: ['a', 'b'], name: 'x' });
		expect(search).toEqual(expected);
	});
});

describe('attachNodeHttpWebSocketUpgrades context()', () => {
	async function withServer<T>(run: (url: (path: string) => string) => Promise<T>): Promise<T> {
		const handler: EcopagesWebSocketHandler<{ itemId: string }, { itemId: string }> = {
			context: ({ params }) => {
				if (params.itemId !== 'ok') {
					throw new Error('rejected');
				}
				return { itemId: params.itemId };
			},
			onConnect: (socket) => socket.send(`connected:${socket.context.itemId}`),
		};
		const server = createServer();
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: 'http://localhost',
			hostPolicy: anyHostPolicy,
			websocketHandlers: new Map([['/ws/items/:itemId', handler as EcopagesWebSocketHandler]]),
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;

		try {
			return await run((path) => `ws://127.0.0.1:${port}${path}`);
		} finally {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	}

	it('refuses the upgrade with an HTTP error when context() rejects', async () => {
		const events: string[] = [];
		let status: number | undefined;

		await withServer(async (url) => {
			const client = new WebSocket(url('/ws/items/nope'));
			client.on('open', () => events.push('open'));
			client.on('unexpected-response', (_req, res) => {
				status = res.statusCode;
				res.resume();
				client.terminate();
				events.push('unexpected-response');
			});
			client.on('error', () => events.push('error'));
			await new Promise<void>((resolve) => client.once('close', () => resolve()));
		});

		expect(events).not.toContain('open');
		expect(status).toBe(403);
	});

	it('still sends the connect payload for an accepted context()', async () => {
		const message = await withServer(async (url) => {
			const client = new WebSocket(url('/ws/items/ok'));
			const received = await new Promise<string>((resolve, reject) => {
				client.once('message', (data) => resolve(data.toString()));
				client.once('error', reject);
			});
			client.close();
			return received;
		});

		expect(message).toBe('connected:ok');
	});
});
