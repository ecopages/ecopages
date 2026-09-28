import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeClientBridge } from './node-client-bridge.ts';

// ---------------------------------------------------------------------------
// Minimal WebSocket mock — only the surface that NodeClientBridge touches
// ---------------------------------------------------------------------------
function createMockWs(readyState = 1 /* OPEN */) {
	return {
		readyState,
		send: vi.fn(),
		ping: vi.fn(),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('NodeClientBridge', () => {
	let bridge: NodeClientBridge;

	beforeEach(() => {
		vi.useFakeTimers();
		bridge = new NodeClientBridge();
	});

	afterEach(() => {
		bridge.destroy();
		vi.useRealTimers();
	});

	// ── subscribe / unsubscribe ─────────────────────────────────────────────

	describe('subscribe / unsubscribe', () => {
		it('increments subscriberCount when a socket is added', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);
			expect(bridge.subscriberCount).toBe(1);
		});

		it('decrements subscriberCount when a socket is removed', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);
			bridge.unsubscribe(ws as never);
			expect(bridge.subscriberCount).toBe(0);
		});

		it('handles unsubscribing a socket that was never added', () => {
			const ws = createMockWs();
			expect(() => bridge.unsubscribe(ws as never)).not.toThrow();
		});
	});

	// ── broadcast ──────────────────────────────────────────────────────────

	describe('broadcast', () => {
		it('sends the serialised event to all OPEN subscribers', () => {
			const ws1 = createMockWs(1);
			const ws2 = createMockWs(1);
			bridge.subscribe(ws1 as never);
			bridge.subscribe(ws2 as never);

			bridge.broadcast({ type: 'reload' });

			expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reload' }));
			expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reload' }));
		});

		it('does NOT send to a socket that is not OPEN (readyState !== 1)', () => {
			const closedWs = createMockWs(3 /* CLOSED */);
			bridge.subscribe(closedWs as never);

			bridge.broadcast({ type: 'reload' });

			expect(closedWs.send).not.toHaveBeenCalled();
		});
	});

	// ── convenience helpers ────────────────────────────────────────────────

	describe('convenience broadcast helpers', () => {
		it('reload() broadcasts a reload event', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);

			bridge.reload();

			expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reload' }));
		});

		it('cssUpdate() broadcasts a css-update event with path and timestamp', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);

			bridge.cssUpdate('/styles/main.css');

			const payload = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
			expect(payload.type).toBe('css-update');
			expect(payload.path).toBe('/styles/main.css');
			expect(typeof payload.timestamp).toBe('number');
		});

		it('update() broadcasts an update event with path and timestamp', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);

			bridge.update('/pages/index.ts');

			const payload = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
			expect(payload.type).toBe('update');
			expect(payload.path).toBe('/pages/index.ts');
		});

		it('error() broadcasts an error event with the message', () => {
			const ws = createMockWs();
			bridge.subscribe(ws as never);

			bridge.error('build failed');

			expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', message: 'build failed' }));
		});
	});

	// ── heartbeat sweep ────────────────────────────────────────────────────

	describe('heartbeat sweep (every 30 s)', () => {
		it('pings OPEN subscribers on each sweep', () => {
			const ws = createMockWs(1);
			bridge.subscribe(ws as never);

			vi.advanceTimersByTime(30_000);

			expect(ws.ping).toHaveBeenCalledTimes(1);
		});

		it('removes zombie sockets (non-OPEN) from the subscriber set', () => {
			const liveWs = createMockWs(1 /* OPEN */);
			const deadWs = createMockWs(3 /* CLOSED */);
			bridge.subscribe(liveWs as never);
			bridge.subscribe(deadWs as never);

			expect(bridge.subscriberCount).toBe(2);

			vi.advanceTimersByTime(30_000);

			expect(bridge.subscriberCount).toBe(1);
			expect(liveWs.ping).toHaveBeenCalledTimes(1);
			expect(deadWs.ping).not.toHaveBeenCalled();
		});

		it('accumulates cleanup across multiple sweeps', () => {
			const ws1 = createMockWs(1);
			bridge.subscribe(ws1 as never);

			// First sweep – still alive
			vi.advanceTimersByTime(30_000);
			expect(bridge.subscriberCount).toBe(1);

			// Socket goes away
			ws1.readyState = 3;

			// Second sweep – removed
			vi.advanceTimersByTime(30_000);
			expect(bridge.subscriberCount).toBe(0);
		});
	});

	// ── destroy ────────────────────────────────────────────────────────────

	describe('destroy()', () => {
		it('stops the heartbeat timer so no further pings are sent', () => {
			const ws = createMockWs(1);
			bridge.subscribe(ws as never);

			bridge.destroy();

			// Advancing time should NOT trigger any sweep
			vi.advanceTimersByTime(30_000 * 5);

			expect(ws.ping).not.toHaveBeenCalled();
		});

		it('clears all subscribers', () => {
			bridge.subscribe(createMockWs() as never);
			bridge.subscribe(createMockWs() as never);

			bridge.destroy();

			expect(bridge.subscriberCount).toBe(0);
		});

		it('is safe to call destroy() multiple times', () => {
			expect(() => {
				bridge.destroy();
				bridge.destroy();
			}).not.toThrow();
		});
	});
});
