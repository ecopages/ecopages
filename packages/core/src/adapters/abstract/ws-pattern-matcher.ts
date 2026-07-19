import type { EcopagesWebSocketHandler } from '../../types/public-types.ts';
import { matchColonSegmentPath, scoreColonSegmentPath } from './segment-path-matcher.ts';

export type WebSocketRouteMatch = {
	handler: EcopagesWebSocketHandler<any, any>;
	params: Record<string, string>;
	kind: string;
};

/**
 * Pattern matcher for WebSocket route paths.
 */
export function matchWebSocketPath(pattern: string, pathname: string): Record<string, string> | null {
	return matchColonSegmentPath(pattern, pathname);
}

export function scoreWebSocketPattern(pattern: string): number {
	return scoreColonSegmentPath(pattern);
}

export function findWebSocketRoute(
	handlers: Map<string, EcopagesWebSocketHandler<any, any>>,
	pathname: string,
): WebSocketRouteMatch | null {
	let best: { score: number; match: WebSocketRouteMatch; index: number } | null = null;
	let index = 0;
	for (const [pattern, handler] of handlers) {
		const params = matchColonSegmentPath(pattern, pathname);
		if (params === null) {
			index += 1;
			continue;
		}
		const score = scoreColonSegmentPath(pattern);
		const match: WebSocketRouteMatch = { handler, params, kind: pattern };
		if (best === null || score > best.score || (score === best.score && index < best.index)) {
			best = { score, match, index };
		}
		index += 1;
	}
	return best?.match ?? null;
}
