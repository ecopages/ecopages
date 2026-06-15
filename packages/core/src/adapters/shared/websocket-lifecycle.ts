import { appLogger } from '../../global/app-logger.ts';
import type { WebSocketCloseInfo } from '../../types/public-types.ts';

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
