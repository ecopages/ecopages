/**
 * Pattern matcher for WebSocket route paths.
 *
 * Supports dynamic segments via `:param` syntax. Matches are exact on literal
 * segments and capture dynamic segments into a params object.
 *
 * @example
 * ```ts
 * matchWebSocketPath('/ws/chat/:id', '/ws/chat/abc123')
 * // Returns: { id: 'abc123' }
 *
 * matchWebSocketPath('/ws/chat/:id', '/ws/chat/abc123/messages')
 * // Returns: null (length mismatch)
 *
 * matchWebSocketPath('/ws/chat', '/ws/chat')
 * // Returns: {} (no params)
 * ```
 *
 * @remarks
 * This is a minimal segment-based matcher. It does not support wildcards,
 * optional segments, or catch-all patterns. Those are future concerns.
 *
 * @param pattern - The registered route pattern (e.g. '/ws/chat/:id')
 * @param pathname - The actual request pathname (e.g. '/ws/chat/abc123')
 * @returns A params object if the pattern matches, or null if it does not
 */
export function matchWebSocketPath(
	pattern: string,
	pathname: string,
): Record<string, string> | null {
	const patternSegments = pattern.split('/').filter(Boolean);
	const pathSegments = pathname.split('/').filter(Boolean);

	if (patternSegments.length !== pathSegments.length) {
		return null;
	}

	const params: Record<string, string> = {};

	for (let i = 0; i < patternSegments.length; i++) {
		const patternSegment = patternSegments[i];
		const pathSegment = pathSegments[i];

		if (!patternSegment || !pathSegment) {
			return null;
		}

		if (patternSegment.startsWith(':')) {
			const paramName = patternSegment.slice(1);
			if (!paramName) {
				return null;
			}
			params[paramName] = pathSegment;
		} else if (patternSegment !== pathSegment) {
			return null;
		}
	}

	return params;
}

import type { EcopagesWebSocketHandler } from '../../types/public-types.ts';

/**
 * Represents a matched WebSocket route.
 */
export type WebSocketRouteMatch = {
	handler: EcopagesWebSocketHandler<any, any>;
	params: Record<string, string>;
	kind: string;
};

/**
 * Scores a pattern for specificity ordering.
 *
 * Higher scores win. Rules, in order:
 * 1. More literal segments beats more dynamic segments.
 * 2. Fewer dynamic segments beats more dynamic segments.
 * 3. Longer route (more segments) beats shorter route.
 *
 * @param pattern - The registered route pattern
 * @returns A numeric specificity score
 */
export function scoreWebSocketPattern(pattern: string): number {
	const segments = pattern.split('/').filter(Boolean);
	let literals = 0;
	let dynamics = 0;
	for (const segment of segments) {
		if (segment.startsWith(':')) {
			dynamics += 1;
		} else {
			literals += 1;
		}
	}
	// weight: literals are stronger than dynamics, longer beats shorter
	return literals * 100 - dynamics * 10 + segments.length;
}

/**
 * Find the registered WebSocket handler that best matches a pathname.
 *
 * Iterates through the provided handlers map, computes each pattern's
 * specificity score, and returns the highest-scoring match. Ties resolve
 * to the earliest-registered pattern.
 *
 * @param handlers - The map of registered WebSocket handlers
 * @param pathname - The actual request pathname
 * @returns The best match, or null if no pattern matches
 */
export function findWebSocketRoute(
	handlers: Map<string, EcopagesWebSocketHandler<any, any>>,
	pathname: string,
): WebSocketRouteMatch | null {
	let best: { score: number; match: WebSocketRouteMatch; index: number } | null = null;
	let index = 0;
	for (const [pattern, handler] of handlers) {
		const params = matchWebSocketPath(pattern, pathname);
		if (params === null) {
			index += 1;
			continue;
		}
		const score = scoreWebSocketPattern(pattern);
		const match: WebSocketRouteMatch = { handler, params, kind: pattern };
		if (best === null || score > best.score || (score === best.score && index < best.index)) {
			best = { score, match, index };
		}
		index += 1;
	}
	return best?.match ?? null;
}
