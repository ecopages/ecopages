import { describe, expect, it } from 'vitest';
import { findWebSocketRoute } from './ws-pattern-matcher.ts';
import type { EcopagesWebSocketHandler } from '../../types/public-types.ts';

describe('findWebSocketRoute', () => {
	it('returns the most specific matching handler', () => {
		const handlers = new Map<string, EcopagesWebSocketHandler>([
			['/ws/chat/:roomId', { onConnect: () => {} }],
			['/ws/chat/lobby', { onConnect: () => {} }],
		]);

		const match = findWebSocketRoute(handlers, '/ws/chat/lobby');
		expect(match?.kind).toBe('/ws/chat/lobby');
	});

	it('resolves ties to the earliest registered pattern', () => {
		const first = { onConnect: () => {} };
		const second = { onConnect: () => {} };
		const handlers = new Map<string, EcopagesWebSocketHandler>([
			['/ws/:a/:b', first],
			['/ws/:x/:y', second],
		]);

		const match = findWebSocketRoute(handlers, '/ws/one/two');
		expect(match?.handler).toBe(first);
	});

	it('returns null when no pattern matches', () => {
		const handlers = new Map<string, EcopagesWebSocketHandler>([['/ws/chat/:roomId', { onConnect: () => {} }]]);
		expect(findWebSocketRoute(handlers, '/api/health')).toBeNull();
	});
});
