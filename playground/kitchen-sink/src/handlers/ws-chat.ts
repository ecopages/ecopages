/**
 * WebSocket chat handler for the kitchen-sink WS Chat lab.
 *
 * Everything here is intentionally ephemeral and in-process:
 * - `CHAT_MESSAGES` is a module-level constant (no database, no persistence).
 * - Connected sockets are tracked in `chatClients` so every new message is
 *   broadcast to all open connections.
 * - The handler is registered with `app.websocket('/ws/chat', chatWebsocketHandler)`
 *   in `app.ts` and is completely agnostic of Bun vs Node.
 *
 * The handler uses the long-term shape:
 * - `context()` builds per-connection state from `params` and `search`.
 * - `onConnect`, `onMessage`, `onClose`, `onError` are the lifecycle hooks.
 * - Incoming frames are typed as text or binary; outgoing payloads can be text,
 *   binary buffers, or a `ReadableStream<Uint8Array>` via `sendStream()`.
 */

import type {
	EcopagesSocket,
	EcopagesWebSocketHandler,
} from '@ecopages/core';

export type ChatWebSocketData = {
	username: string;
	roomId?: string;
};

export type ChatMessage = {
	id: string;
	username: string;
	roomId?: string;
	text: string;
	ts: number;
};

/**
 * In-memory message store — seeded with a few messages so history replay is testable.
 */
export const CHAT_MESSAGES: ChatMessage[] = [
	{ id: '1', username: 'system', text: 'Welcome to the WS Chat lab 👋', ts: Date.now() - 60_000 },
	{ id: '2', username: 'alice', text: 'This chat tests the WebSocket injection API.', ts: Date.now() - 30_000 },
	{ id: '3', username: 'bob', text: 'Messages are stored in a module constant — no DB needed.', ts: Date.now() - 10_000 },
];

/**
 * Live connections. Typed as `EcopagesSocket<ChatWebSocketData>` so we stay
 * runtime-agnostic at the module level.
 */
const chatClients = new Set<EcopagesSocket<ChatWebSocketData>>();

/**
 * Broadcasts a JSON-serializable payload to all connected clients.
 *
 * @param payload - The data to broadcast (will be JSON.stringify'd)
 */
function broadcast(payload: unknown): void {
	const msg = JSON.stringify(payload);
	for (const client of chatClients) {
		try {
			client.send(msg);
		} catch {
			chatClients.delete(client);
		}
	}
}

export const chatWebsocketHandler: EcopagesWebSocketHandler<ChatWebSocketData> = {
	async context({ params, search }) {
		return {
			username: search.username ?? 'anonymous',
			roomId: params.roomId,
		};
	},

	onConnect(socket) {
		chatClients.add(socket);

		/**
		 * Replay history so the joining client sees previous messages.
		 */
		socket.send(
			JSON.stringify({
				type: 'history',
				messages: CHAT_MESSAGES,
			}),
		);
	},

	onMessage(socket, message) {
		if (message.kind !== 'text') {
			/**
			 * Binary frames are echoed back so the lab can showcase round-trip
			 * binary support. Apps typically branch here.
			 */
			socket.send(message.data);
			return;
		}

		let payload: { type?: string; text?: string };
		try {
			payload = JSON.parse(message.text);
		} catch {
			return;
		}

		if (payload.type !== 'message' || !payload.text?.trim()) return;

		const msg: ChatMessage = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			username: socket.context.username,
			roomId: socket.context.roomId,
			text: payload.text.trim(),
			ts: Date.now(),
		};

		CHAT_MESSAGES.push(msg);
		broadcast({ type: 'message', message: msg });
	},

	onClose(socket) {
		chatClients.delete(socket);
	},
};
