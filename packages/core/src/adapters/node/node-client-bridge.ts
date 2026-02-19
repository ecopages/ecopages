import type { WebSocket } from 'ws';
import type { ClientBridgeEvent, IClientBridge } from '../../public-types.ts';

export class NodeClientBridge implements IClientBridge {
	private subscribers = new Set<WebSocket>();

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
}
