import type { ServerWebSocket } from 'bun';
import type { ClientBridgeEvent } from '../../public-types';

/**
 * Manages WebSocket subscribers and broadcasts development events.
 * Single-responsibility class for client communication.
 */
export class Broadcaster {
	private subscribers = new Set<ServerWebSocket<unknown>>();

	subscribe(ws: ServerWebSocket<unknown>): void {
		this.subscribers.add(ws);
	}

	unsubscribe(ws: ServerWebSocket<unknown>): void {
		this.subscribers.delete(ws);
	}

	/**
	 * Broadcast a raw event to all connected clients.
	 */
	broadcast(event: ClientBridgeEvent): void {
		const payload = JSON.stringify(event);
		for (const ws of this.subscribers) {
			ws.send(payload);
		}
	}

	/**
	 * Trigger a full page reload on all connected clients.
	 */
	reload(): void {
		this.broadcast({ type: 'reload' });
	}

	/**
	 * Broadcast a CSS update for hot stylesheet reload.
	 */
	cssUpdate(path: string): void {
		this.broadcast({ type: 'css-update', path, timestamp: Date.now() });
	}

	/**
	 * Broadcast a JS module update for hot module replacement.
	 */
	update(path: string): void {
		this.broadcast({ type: 'update', path, timestamp: Date.now() });
	}

	/**
	 * Broadcast an error message to connected clients.
	 */
	error(message: string): void {
		this.broadcast({ type: 'error', message });
	}

	get subscriberCount(): number {
		return this.subscribers.size;
	}
}
