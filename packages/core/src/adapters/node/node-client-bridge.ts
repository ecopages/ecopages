import type { WebSocket } from 'ws';
import type { ClientBridgeEvent, IClientBridge } from '../../public-types.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;

export class NodeClientBridge implements IClientBridge {
	private subscribers = new Set<WebSocket>();
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.heartbeatTimer = setInterval(() => this.sweep(), HEARTBEAT_INTERVAL_MS);
		/* Allow the process to exit even if the timer is still active */
		this.heartbeatTimer.unref?.();
	}

	/**
	 * Pings all open subscribers and removes any that are no longer in OPEN state.
	 * This prevents a slow memory leak caused by zombie connections that never
	 * send a close event (e.g. abruptly killed browsers, orphaned tabs, network drops).
	 */
	private sweep(): void {
		for (const ws of this.subscribers) {
			if (ws.readyState !== 1 /* OPEN */) {
				this.subscribers.delete(ws);
				continue;
			}
			ws.ping();
		}
	}

	subscribe(ws: WebSocket): void {
		this.subscribers.add(ws);
	}

	unsubscribe(ws: WebSocket): void {
		this.subscribers.delete(ws);
	}

	broadcast(event: ClientBridgeEvent): void {
		const payload = JSON.stringify(event);
		for (const ws of this.subscribers) {
			if (ws.readyState === 1) {
				ws.send(payload);
			}
		}
	}

	reload(): void {
		this.broadcast({ type: 'reload' });
	}

	cssUpdate(path: string): void {
		this.broadcast({ type: 'css-update', path, timestamp: Date.now() });
	}

	update(path: string): void {
		this.broadcast({ type: 'update', path, timestamp: Date.now() });
	}

	error(message: string): void {
		this.broadcast({ type: 'error', message });
	}

	get subscriberCount(): number {
		return this.subscribers.size;
	}

	/**
	 * Stops the heartbeat timer and clears all subscribers.
	 * Call this when the dev server is shutting down.
	 */
	destroy(): void {
		if (this.heartbeatTimer !== null) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.subscribers.clear();
	}
}
