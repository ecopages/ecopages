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
