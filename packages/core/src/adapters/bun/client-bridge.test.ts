import { describe, expect, it, mock, afterEach } from 'bun:test';
import { ClientBridge } from './client-bridge';
import type { ServerWebSocket } from 'bun';

interface MockWebSocket extends Partial<ServerWebSocket<unknown>> {
	send: ReturnType<typeof mock>;
}

describe('ClientBridge', () => {
	afterEach(() => {
		mock.restore();
	});

	it('should manage subscribers', () => {
		const bridge = new ClientBridge();
		const ws = { send: mock() } as MockWebSocket;

		bridge.subscribe(ws as unknown as ServerWebSocket<unknown>);
		expect(bridge.subscriberCount).toBe(1);

		bridge.unsubscribe(ws as unknown as ServerWebSocket<unknown>);
		expect(bridge.subscriberCount).toBe(0);
	});

	it('should broadcast events to all subscribers', () => {
		const bridge = new ClientBridge();
		const ws1 = { send: mock() } as MockWebSocket;
		const ws2 = { send: mock() } as MockWebSocket;

		bridge.subscribe(ws1 as unknown as ServerWebSocket<unknown>);
		bridge.subscribe(ws2 as unknown as ServerWebSocket<unknown>);

		bridge.broadcast({ type: 'reload' });

		const expectedPayload = JSON.stringify({ type: 'reload' });
		expect(ws1.send).toHaveBeenCalledWith(expectedPayload);
		expect(ws2.send).toHaveBeenCalledWith(expectedPayload);
	});

	it('should broadcast reload event', () => {
		const bridge = new ClientBridge();
		const ws = { send: mock() } as MockWebSocket;
		bridge.subscribe(ws as unknown as ServerWebSocket<unknown>);

		bridge.reload();

		expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reload' }));
	});

	it('should broadcast css-update event', () => {
		const bridge = new ClientBridge();
		const ws = { send: mock() } as MockWebSocket;
		bridge.subscribe(ws as unknown as ServerWebSocket<unknown>);

		const path = '/styles/main.css';
		bridge.cssUpdate(path);

		const call = ws.send.mock.calls[0][0];
		const payload = JSON.parse(call as string);

		expect(payload.type).toBe('css-update');
		expect(payload.path).toBe(path);
		expect(payload.timestamp).toBeDefined();
	});

	it('should broadcast update event', () => {
		const bridge = new ClientBridge();
		const ws = { send: mock() } as MockWebSocket;
		bridge.subscribe(ws as unknown as ServerWebSocket<unknown>);

		const path = '/scripts/main.js';
		bridge.update(path);

		const call = ws.send.mock.calls[0][0];
		const payload = JSON.parse(call as string);

		expect(payload.type).toBe('update');
		expect(payload.path).toBe(path);
		expect(payload.timestamp).toBeDefined();
	});

	it('should broadcast error event', () => {
		const bridge = new ClientBridge();
		const ws = { send: mock() } as MockWebSocket;
		bridge.subscribe(ws as unknown as ServerWebSocket<unknown>);

		const message = 'Something went wrong';
		bridge.error(message);

		expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', message }));
	});
});
