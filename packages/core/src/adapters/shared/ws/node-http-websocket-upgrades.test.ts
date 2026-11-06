import { EventEmitter } from 'node:events';
import { createServer, type Server as NodeHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { parseSearchParams } from '../../../router/server/parse-search-params.ts';
import type { EcopagesSocket, EcopagesWebSocketHandler } from '../../../types/contracts.ts';
import { attachNodeHttpWebSocketUpgrades } from './node-http-websocket-upgrades.ts';

function emitUpgrade(server: EventEmitter, url: string) {
	const socket = { destroy: vi.fn(), end: vi.fn() };
	server.emit('upgrade', { url, headers: {} }, socket, Buffer.alloc(0));
	return socket;
}

describe('attachNodeHttpWebSocketUpgrades', () => {
	const hmrPreflight = (req: { url?: string }) => req.url === '/_hmr';

	function attach(websocketHandlers = new Map<string, EcopagesWebSocketHandler>()) {
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://localhost:3000',
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
