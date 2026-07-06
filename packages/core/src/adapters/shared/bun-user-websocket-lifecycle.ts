import type { ServerWebSocket } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { EcopagesSocket, EcopagesWebSocketHandler, IncomingWebSocketMessage } from '../../types/public-types.ts';
import { invokeWebSocketHandlerHook, toWebSocketCloseInfo } from './websocket-lifecycle.ts';

export type BunUserWebSocketData = {
	kind: string;
	params: Record<string, string>;
	search: Record<string, string>;
	upgradeUrl?: string;
	context?: unknown;
	[key: string]: unknown;
};

export type BunUserWebSocketLifecycleDeps<TWsData extends BunUserWebSocketData> = {
	runtimeOrigin: string;
	userHandlers: Map<string, EcopagesWebSocketHandler<any, any>>;
	resolveContext: <TContext, TParams extends Record<string, string>>(
		request: Request,
		handler: EcopagesWebSocketHandler<TContext, TParams>,
		kind: string,
		params: TParams,
		search: Record<string, string>,
	) => Promise<TContext>;
	adaptSocket: <TContext, TParams extends Record<string, string>>(
		ws: ServerWebSocket<TWsData>,
		kind: string,
		params: TParams,
		search: Record<string, string>,
		context: TContext,
	) => EcopagesSocket<TContext, TParams>;
};

function toUpgradeRequest<TWsData extends BunUserWebSocketData>(
	ws: ServerWebSocket<TWsData>,
	runtimeOrigin: string,
): Request {
	const upgradeUrl = ws.data?.upgradeUrl;
	if (upgradeUrl) {
		return new Request(upgradeUrl);
	}

	return new Request(runtimeOrigin);
}

async function runUserWebSocketOpen<TWsData extends BunUserWebSocketData>(
	ws: ServerWebSocket<TWsData>,
	kind: string,
	deps: BunUserWebSocketLifecycleDeps<TWsData>,
): Promise<void> {
	const handler = deps.userHandlers.get(kind) as
		EcopagesWebSocketHandler<unknown, Record<string, string>> | undefined;
	if (!handler) {
		return;
	}

	const params = (ws.data?.params ?? {}) as Record<string, string>;
	const search = ws.data?.search ?? {};
	const request = toUpgradeRequest(ws, deps.runtimeOrigin);

	let context: unknown;
	try {
		context = await deps.resolveContext(request, handler, kind, params, search);
	} catch {
		ws.close(1011, 'context initialization failed');
		return;
	}

	ws.data.context = context;
	const socket = deps.adaptSocket(ws, kind, params, search, context);

	try {
		await handler.onConnect?.(socket);
	} catch (error) {
		appLogger.error(`[WS:${kind}] onConnect failed:`, error as Error);
		ws.close(1011, 'onConnect failed');
	}
}

export function createBunUserWebSocketLifecycle<TWsData extends BunUserWebSocketData>(
	deps: BunUserWebSocketLifecycleDeps<TWsData>,
): {
	open(ws: ServerWebSocket<TWsData>): void;
	message(ws: ServerWebSocket<TWsData>, msg: string | Buffer): void;
	close(ws: ServerWebSocket<TWsData>, code: number, reason: string): void;
	error(ws: ServerWebSocket<TWsData>, error: Error): void;
} {
	const resolveSocketForEvent = (
		ws: ServerWebSocket<TWsData>,
	):
		| { kind: string; handler: EcopagesWebSocketHandler<unknown, Record<string, string>>; socket: EcopagesSocket }
		| undefined => {
		const kind = ws.data?.kind;
		if (!kind) {
			return undefined;
		}

		const handler = deps.userHandlers.get(kind) as
			EcopagesWebSocketHandler<unknown, Record<string, string>> | undefined;
		if (!handler) {
			return undefined;
		}

		const params = (ws.data?.params ?? {}) as Record<string, string>;
		const search = ws.data?.search ?? {};
		const socket = deps.adaptSocket(ws, kind, params, search, ws.data?.context);
		return { kind, handler, socket };
	};

	return {
		open(ws) {
			const kind = ws.data?.kind;
			if (!kind) {
				return;
			}

			void runUserWebSocketOpen(ws, kind, deps).catch((error) => {
				appLogger.error(`[WS:${kind}] open failed:`, error as Error);
				ws.close(1011, 'internal error');
			});
		},
		message(ws, msg) {
			const resolved = resolveSocketForEvent(ws);
			if (!resolved) {
				return;
			}

			if (ws.data?.context === undefined && resolved.handler.context) {
				appLogger.warn(`[WS:${resolved.kind}] message received before context resolved; dropping.`);
				return;
			}

			const message: IncomingWebSocketMessage =
				typeof msg === 'string'
					? { kind: 'text', text: msg }
					: { kind: 'binary', data: new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength) };

			invokeWebSocketHandlerHook(
				resolved.kind,
				'onMessage',
				resolved.handler.onMessage?.(resolved.socket, message),
			);
		},
		close(ws, code, reason) {
			const resolved = resolveSocketForEvent(ws);
			if (!resolved) {
				return;
			}

			const event = toWebSocketCloseInfo(code, reason);
			invokeWebSocketHandlerHook(resolved.kind, 'onClose', resolved.handler.onClose?.(resolved.socket, event));
		},
		error(ws, error) {
			const resolved = resolveSocketForEvent(ws);
			if (!resolved) {
				return;
			}

			appLogger.error(`[WS:${resolved.kind}] error:`, error as Error);
			invokeWebSocketHandlerHook(resolved.kind, 'onError', resolved.handler.onError?.(resolved.socket, error));
		},
	};
}
