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

	function attach(passthroughUnmatched: boolean) {
		const server = new EventEmitter();
		attachNodeHttpWebSocketUpgrades(server as unknown as NodeHttpServer, {
			runtimeOrigin: 'http://localhost:3000',
			websocketHandlers: new Map(),
			preflight: hmrPreflight,
			passthroughUnmatched,
		});
		return server;
	}

	it('leaves unmatched upgrades for other listeners when passthrough is set', () => {
		const server = attach(true);

		expect(emitUpgrade(server, '/vite-hmr').destroy).not.toHaveBeenCalled();
		expect(emitUpgrade(server, '/_hmr').destroy).not.toHaveBeenCalled();
	});

	it('destroys unmatched upgrades on a server it owns', () => {
		const server = attach(false);

		expect(emitUpgrade(server, '/vite-hmr').destroy).toHaveBeenCalledOnce();
		expect(emitUpgrade(server, '/_hmr').destroy).not.toHaveBeenCalled();
	});
});
