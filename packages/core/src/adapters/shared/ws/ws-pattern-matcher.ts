import type { EcopagesWebSocketHandler } from '../../../types/contracts.ts';
import {
	matchParsedSegmentPath,
	parseSegmentPath,
	scoreSegmentPathPattern,
} from '../../../router/server/segment-path-matcher.ts';

export type WebSocketRouteMatch = {
	handler: EcopagesWebSocketHandler<unknown, Record<string, string>>;
	params: Record<string, string>;
	kind: string;
};

export function findWebSocketRoute(
	handlers: Map<string, EcopagesWebSocketHandler<unknown, Record<string, string>>>,
	pathname: string,
): WebSocketRouteMatch | null {
	const pathSegments = parseSegmentPath(pathname);
	let best: { score: number; match: WebSocketRouteMatch; index: number } | null = null;
	let index = 0;
	for (const [pattern, handler] of handlers) {
		const params = matchParsedSegmentPath(pattern, pathSegments, 'websocket');
		if (params === null) {
			index += 1;
			continue;
		}
		const score = scoreSegmentPathPattern(pattern, 'websocket');
		const match: WebSocketRouteMatch = { handler, params, kind: pattern };
		if (best === null || score > best.score || (score === best.score && index < best.index)) {
			best = { score, match, index };
		}
		index += 1;
	}
	return best?.match ?? null;
}
