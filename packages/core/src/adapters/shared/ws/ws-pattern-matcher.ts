import type { EcopagesWebSocketHandler } from '../../../types/contracts.ts';
import {
	compileSegmentPattern,
	matchParsedSegmentPath,
	parseSegmentPath,
	type SegmentPattern,
} from '../../../router/server/segment-path-matcher.ts';

export type WebSocketRouteMatch = {
	handler: EcopagesWebSocketHandler<unknown, Record<string, string>>;
	params: Record<string, string>;
	kind: string;
};

/**
 * WebSocket handlers with their patterns parsed, in registration order.
 *
 * @remarks Build it with {@link compileWebSocketRoutes} once the handlers are known, so an upgrade only
 * compares path segments.
 */
export type CompiledWebSocketRoutes = ReadonlyArray<{
	pattern: string;
	compiled: SegmentPattern<'websocket'>;
	handler: EcopagesWebSocketHandler<unknown, Record<string, string>>;
}>;

export function compileWebSocketRoutes(
	handlers: ReadonlyMap<string, EcopagesWebSocketHandler<unknown, Record<string, string>>>,
): CompiledWebSocketRoutes {
	return [...handlers].map(([pattern, handler]) => ({
		pattern,
		compiled: compileSegmentPattern(pattern, 'websocket'),
		handler,
	}));
}

export function findWebSocketRoute(routes: CompiledWebSocketRoutes, pathname: string): WebSocketRouteMatch | null {
	const pathSegments = parseSegmentPath(pathname);
	let best: { score: number; match: WebSocketRouteMatch } | null = null;
	for (const { pattern, compiled, handler } of routes) {
		const params = matchParsedSegmentPath(compiled, pathSegments);
		if (params === null) continue;
		if (best === null || compiled.score > best.score) {
			best = { score: compiled.score, match: { handler, params, kind: pattern } };
		}
	}
	return best?.match ?? null;
}
