import type { Duplex } from 'node:stream';
import type { Server as NodeHttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { appLogger } from '../../global/app-logger.ts';
import type {
	EcopagesSocket,
	EcopagesWebSocketHandler,
	IncomingWebSocketMessage,
} from '../../types/public-types.ts';
import { findWebSocketRoute, type WebSocketRouteMatch } from '../abstract/ws-pattern-matcher.ts';
import { createEcopagesSocket, invokeWebSocketHandlerHook, toWebSocketCloseInfo } from './websocket-lifecycle.ts';

export type NodeHttpWebSocketUpgradePreflight = (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;

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

const attachedUpgradeServers = new WeakSet<NodeHttpServer>();

function adaptNodeWebSocket<TContext, TParams extends Record<string, string>>(
	ws: WsWebSocket,
	kind: string,
	params: TParams,
	search: Record<string, string>,
	context: TContext,
): EcopagesSocket<TContext, TParams> {
	return createEcopagesSocket(
		{
			send: (data) => ws.send(data),
			close: (code, reason) => ws.close(code, reason),
		},
		{ kind, params, search, context },
	);
}

function toUpgradeRequest(runtimeOrigin: string, req: IncomingMessage): Request {
	const upgradeUrl = new URL(req.url ?? '/', runtimeOrigin);
	return new Request(upgradeUrl, {
		method: req.method,
		headers: req.headers as HeadersInit,
	});
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
	runtimeOrigin: string,
	search: Record<string, string>,
): Promise<void> {
	const handler = wsMatch.handler as EcopagesWebSocketHandler<unknown, Record<string, string>>;
	const baseRequest = toUpgradeRequest(runtimeOrigin, req);

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
		ws.close(1011, 'onConnect failed');
		return;
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
		invokeWebSocketHandlerHook(wsMatch.kind, 'onMessage', handler.onMessage?.(socket, message));
	});

	ws.on('close', (code, reason) => {
		const event = toWebSocketCloseInfo(code, reason.toString());
		invokeWebSocketHandlerHook(wsMatch.kind, 'onClose', handler.onClose?.(socket, event));
	});

	ws.on('error', (err) => {
		appLogger.error(`[WS:${wsMatch.kind}] error:`, err);
		invokeWebSocketHandlerHook(wsMatch.kind, 'onError', handler.onError?.(socket, err));
	});
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

	if (attachedUpgradeServers.has(server)) {
		appLogger.warn('[WS] WebSocket upgrades already attached to this HTTP server; skipping duplicate attach.');
		return;
	}

	attachedUpgradeServers.add(server);

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
			void setupNodeWebSocketConnection(ws, wsMatch, req, options.runtimeOrigin, search).catch((error) => {
				appLogger.error(`[WS:${wsMatch.kind}] unexpected error:`, error as Error);
				ws.close(1011, 'internal error');
			});
		});
	});
}
