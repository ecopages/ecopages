import { EventEmitter } from 'node:events';
import type { Server as NodeHttpServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { EcopagesWebSocketHandler } from '../../../types/public-types.ts';
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
