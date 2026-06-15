/**
 * WebSocket room-based chat handler.
 *
 * One registration (`/ws/chat/:roomId`) supports effectively infinite chat
 * rooms. Each connection captures the room id from the URL via `params.roomId`,
 * and broadcast is scoped to clients in the same room.
 *
 * The handler uses the long-term shape:
 * - `context()` resolves per-connection state.
 * - `onMessage` is typed against `IncomingWebSocketMessage`.
 * - Outgoing payloads can be text, binary, or a `ReadableStream<Uint8Array>`.
 */

import type { EcopagesSocket, EcopagesWebSocketHandler } from '@ecopages/core';

export type ChatRoomData = {
	username: string;
	roomId: string;
};

export type ChatRoomMessage = {
	id: string;
	username: string;
	roomId: string;
	text: string;
	ts: number;
};

/**
 * Default room id used by the playground lab page.
 */
export const DEFAULT_ROOM = 'lobby';

/**
 * In-memory message store — seeded with a few messages for the default room
 * so history replay is testable.
 */
export const CHAT_MESSAGES: ChatRoomMessage[] = [
	{
		id: '1',
		username: 'system',
		text: 'Welcome to the WS Chat lab 👋',
		roomId: DEFAULT_ROOM,
		ts: Date.now() - 60_000,
	},
	{
		id: '2',
		username: 'alice',
		text: 'This chat tests the WebSocket injection API.',
		roomId: DEFAULT_ROOM,
		ts: Date.now() - 30_000,
	},
	{
		id: '3',
		username: 'bob',
		text: 'Messages are stored in a module constant — no DB needed.',
		roomId: DEFAULT_ROOM,
		ts: Date.now() - 10_000,
	},
];

const roomClients = new Map<string, Set<EcopagesSocket<ChatRoomData>>>();
const roomHistory = new Map<string, ChatRoomMessage[]>([[DEFAULT_ROOM, [...CHAT_MESSAGES]]]);

const ROOM_LIMIT = 1000;

function broadcastToRoom(roomId: string, payload: unknown): void {
	const clients = roomClients.get(roomId);
	if (!clients) return;
	const msg = JSON.stringify(payload);
	for (const client of clients) {
		try {
			client.send(msg);
		} catch {
			clients.delete(client);
		}
	}
}

function appendToHistory(roomId: string, message: ChatRoomMessage): void {
	let history = roomHistory.get(roomId);
	if (!history) {
		history = [];
		roomHistory.set(roomId, history);
	}
	history.push(message);
	if (history.length > ROOM_LIMIT) {
		history.shift();
	}
}

export const chatRoomWebsocketHandler: EcopagesWebSocketHandler<ChatRoomData, { roomId: string }> = {
	async context({ params, search }) {
		return {
			username: search.username ?? 'anonymous',
			roomId: params.roomId,
		};
	},

	onConnect(socket) {
		const { roomId } = socket.context;
		let clients = roomClients.get(roomId);
		if (!clients) {
			clients = new Set();
			roomClients.set(roomId, clients);
		}
		clients.add(socket);

		socket.send(
			JSON.stringify({
				type: 'history',
				roomId,
				messages: roomHistory.get(roomId) ?? [],
			}),
		);
	},

	onMessage(socket, message) {
		if (message.kind !== 'text') {
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

		const msg: ChatRoomMessage = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			username: socket.context.username,
			roomId: socket.context.roomId,
			text: payload.text.trim(),
			ts: Date.now(),
		};

		appendToHistory(socket.context.roomId, msg);
		broadcastToRoom(socket.context.roomId, { type: 'message', message: msg });
	},

	onClose(socket) {
		const { roomId } = socket.context;
		const clients = roomClients.get(roomId);
		clients?.delete(socket);
		if (clients?.size === 0) {
			roomClients.delete(roomId);
		}
	},
};
