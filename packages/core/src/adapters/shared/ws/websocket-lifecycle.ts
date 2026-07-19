import { appLogger } from '../../../global/app-logger.ts';
import type { EcopagesSocket, OutgoingWebSocketMessage, WebSocketCloseInfo } from '../../../types/public-types.ts';

/**
 * @remarks
 * Bun and Node expose different raw socket types but share the same
 * {@link OutgoingWebSocketMessage} contract. Adapters supply only `send`/`close`;
 * {@link createEcopagesSocket} owns message normalization and stream forwarding.
 */
export interface WebSocketSendTransport {
	send(data: string | Uint8Array): void;
	close(code?: number, reason?: string): void;
}

function sendOutgoingMessage(transport: WebSocketSendTransport, message: OutgoingWebSocketMessage): void {
	if (typeof message === 'string') {
		transport.send(message);
	} else if (message instanceof Blob) {
		void message.arrayBuffer().then((buffer) => transport.send(new Uint8Array(buffer)));
	} else if (message instanceof ArrayBuffer) {
		transport.send(new Uint8Array(message));
	} else if (ArrayBuffer.isView(message)) {
		transport.send(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
	} else {
		transport.send(message);
	}
}

/**
 * @remarks
 * Bun and Node adapters previously duplicated outgoing-message dispatch and
 * stream forwarding; this is the shared implementation both transports delegate to.
 */
export function createEcopagesSocket<TContext, TParams extends Record<string, string>>(
	transport: WebSocketSendTransport,
	meta: { kind: string; params: TParams; search: Record<string, string>; context: TContext },
): EcopagesSocket<TContext, TParams> {
	return {
		kind: meta.kind,
		params: meta.params,
		search: meta.search,
		context: meta.context,
		send: (message) => sendOutgoingMessage(transport, message),
		sendStream: async (stream) => {
			const reader = stream.getReader();
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value) transport.send(value);
				}
			} finally {
				reader.releaseLock();
			}
		},
		close: (code, reason) => transport.close(code, reason),
	};
}

export function toWebSocketCloseInfo(code: number, reason: string): WebSocketCloseInfo {
	return {
		code,
		reason,
		wasClean: code === 1000 || code === 1001,
	};
}

export function invokeWebSocketHandlerHook(kind: string, hookName: string, result: void | Promise<void>): void {
	if (result instanceof Promise) {
		result.catch((error) => {
			appLogger.error(`[WS:${kind}] ${hookName} failed:`, error as Error);
		});
	}
}
