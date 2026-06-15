import type { Duplex } from 'node:stream';
import type { Server as NodeHttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { appLogger } from '../../global/app-logger.ts';
import type {
	EcopagesSocket,
	EcopagesWebSocketHandler,
	IncomingWebSocketMessage,
	OutgoingWebSocketMessage,
	WebSocketCloseInfo,
} from '../../types/public-types.ts';
import { findWebSocketRoute, type WebSocketRouteMatch } from '../abstract/ws-pattern-matcher.ts';

export type NodeHttpWebSocketUpgradePreflight = (
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer,
) => boolean;

export type AttachNodeHttpWebSocketUpgradesOptions = {
	runtimeOrigin: string;
	websocketHandlers: Map<string, EcopagesWebSocketHandler<any, any>>;
	/**
	 * When true, unmatched upgrade requests are left for other listeners (e.g.
	 * Vite HMR). When false, unmatched upgrades are destroyed immediately.
	 */
	passthroughUnmatched?: boolean;
	preflight?: NodeHttpWebSocketUpgradePreflight;
};

function adaptNodeWebSocket<TContext, TParams extends Record<string, string>>(
	ws: WsWebSocket,
	kind: string,
	params: TParams,
	search: Record<string, string>,
	context: TContext,
): EcopagesSocket<TContext, TParams> {
	return {
		kind,
		params,
		search,
		context,
		send: (message: OutgoingWebSocketMessage) => {
			if (typeof message === 'string') {
				ws.send(message);
			} else if (message instanceof Blob) {
				void message.arrayBuffer().then((buf) => ws.send(new Uint8Array(buf)));
			} else if (message instanceof ArrayBuffer) {
				ws.send(new Uint8Array(message));
			} else if (ArrayBuffer.isView(message)) {
				ws.send(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
			} else {
				ws.send(message);
			}
		},
		sendStream: async (stream: ReadableStream<Uint8Array>) => {
			const reader = stream.getReader();
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value) ws.send(value);
				}
			} finally {
				reader.releaseLock();
			}
		},
		close: (code, reason) => ws.close(code, reason),
	};
}

async function resolveNodeContext<TContext, TParams extends Record<string, string>>(
	request: Request,
	handler: EcopagesWebSocketHandler<TContext, TParams>,
	kind: string,
	params: TParams,
	search: Record<string, string>,
): Promise<TContext> {
	if (!handler.context) {
		return undefined as unknown as TContext;
	}

	try {
		return (await handler.context({ request, kind, params, search })) as TContext;
	} catch (error) {
		appLogger.error(`[WS:${kind}] context() failed; closing connection.`, error as Error);
		throw error;
	}
}

async function setupNodeWebSocketConnection(
	ws: WsWebSocket,
	wsMatch: WebSocketRouteMatch,
	req: IncomingMessage,
	search: Record<string, string>,
): Promise<void> {
	const handler = wsMatch.handler as EcopagesWebSocketHandler<unknown, Record<string, string>>;
	const baseRequest = new Request(`http://localhost${req.url ?? '/'}`);

	let context: unknown;
	try {
		context = await resolveNodeContext(baseRequest, handler, wsMatch.kind, wsMatch.params, search);
	} catch {
		ws.close(1011, 'context initialization failed');
		return;
	}

	const socket = adaptNodeWebSocket(ws, wsMatch.kind, wsMatch.params, search, context);

	try {
		await handler.onConnect?.(socket);
	} catch (error) {
		appLogger.error(`[WS:${wsMatch.kind}] onConnect failed:`, error as Error);
	}

	ws.on('message', (msg, isBinary) => {
		const message: IncomingWebSocketMessage = isBinary
			? {
					kind: 'binary',
					data:
						msg instanceof ArrayBuffer
							? new Uint8Array(msg)
							: Array.isArray(msg)
								? new Uint8Array(Buffer.concat(msg))
								: new Uint8Array(msg as Buffer),
				}
			: { kind: 'text', text: msg.toString() };
		const result = handler.onMessage?.(socket, message);
		if (result instanceof Promise) {
			result.catch((error) => appLogger.error(`[WS:${wsMatch.kind}] onMessage failed:`, error as Error));
		}
	});

	ws.on('close', (code, reason) => {
		const event: WebSocketCloseInfo = { code, reason: reason.toString(), wasClean: code === 1000 };
		const result = handler.onClose?.(socket, event);
		if (result instanceof Promise) {
			result.catch((error) => appLogger.error(`[WS:${wsMatch.kind}] onClose failed:`, error as Error));
		}
	});

	ws.on('error', (err) => appLogger.error(`[WS:${wsMatch.kind}] error:`, err));
}

/**
 * Wires Ecopages user WebSocket routes onto a Node HTTP server's `upgrade` event.
 *
 * Used by the Node adapter in standalone mode and by host integrations such as
 * the Vite plugin that embed Ecopages behind a foreign HTTP server.
 */
export function attachNodeHttpWebSocketUpgrades(
	server: NodeHttpServer,
	options: AttachNodeHttpWebSocketUpgradesOptions,
): void {
	if (options.websocketHandlers.size === 0) {
		return;
	}

	const userWss = new WebSocketServer({ noServer: true });

	server.on('upgrade', (req, socket, head) => {
		if (options.preflight?.(req, socket, head)) {
			return;
		}

		const url = new URL(req.url ?? '/', options.runtimeOrigin);
		const wsMatch = findWebSocketRoute(options.websocketHandlers, url.pathname);

		if (!wsMatch) {
			if (!options.passthroughUnmatched) {
				socket.destroy();
			}
			return;
		}

		userWss.handleUpgrade(req, socket, head, (ws) => {
			const search = Object.fromEntries(url.searchParams.entries());
			void setupNodeWebSocketConnection(ws, wsMatch, req, search).catch((error) => {
				appLogger.error(`[WS:${wsMatch.kind}] unexpected error:`, error as Error);
				ws.close(1011, 'internal error');
			});
		});
	});
}
