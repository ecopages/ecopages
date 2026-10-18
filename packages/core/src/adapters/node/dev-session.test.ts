import type { WebSocket, WebSocketServer } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { disposeDevWebSocketServer } from './dev-session.ts';

describe('disposeDevWebSocketServer', () => {
	it('terminates connected clients before closing the server', async () => {
		const events: string[] = [];
		const client = {
			terminate: vi.fn(() => events.push('terminate')),
		} as unknown as WebSocket;
		const close = vi.fn((callback: (error?: Error) => void) => {
			events.push('close');
			callback();
		});
		const websocketServer = {
			clients: new Set([client]),
			close,
		} as unknown as WebSocketServer;

		await disposeDevWebSocketServer(websocketServer);

		expect(events).toEqual(['terminate', 'close']);
		expect(client.terminate).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	});
});
