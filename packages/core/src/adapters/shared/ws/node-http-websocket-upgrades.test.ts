import { EventEmitter } from 'node:events';
import type { Server as NodeHttpServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { attachNodeHttpWebSocketUpgrades } from './node-http-websocket-upgrades.ts';

function emitUpgrade(server: EventEmitter, url: string) {
	const socket = { destroy: vi.fn() };
	server.emit('upgrade', { url, headers: {} }, socket, Buffer.alloc(0));
	return socket;
}

describe('attachNodeHttpWebSocketUpgrades', () => {
	const hmrPreflight = (req: { url?: string }) => req.url === '/_hmr';

	function attach() {
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://localhost:3000',
			websocketHandlers: new Map(),
			preflight: hmrPreflight,
		});
		return server;
	}

	it('destroys unmatched upgrades and leaves the HMR path to the preflight', () => {
		const server = attach();

		expect(emitUpgrade(server, '/other').destroy).toHaveBeenCalledOnce();
		expect(emitUpgrade(server, '/_hmr').destroy).not.toHaveBeenCalled();
	});
});
