import type { ServerWebSocket } from 'bun';
import type { ClientBridgeEvent, IClientBridge } from '../../public-types';

type BunSocket = ServerWebSocket<unknown>;

/**
 * Manages WebSocket subscribers and broadcasts development events.
 * Bridges the gap between the server and the development client.
 */
export class ClientBridge implements IClientBridge {
	private subscribers = new Set<BunSocket>();

	subscribe(ws: BunSocket): void {
		this.subscribers.add(ws);
	}

	unsubscribe(ws: BunSocket): void {
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
