import { describe, expect, it } from 'vitest';
import { findWebSocketRoute, matchWebSocketPath, scoreWebSocketPattern } from './ws-pattern-matcher.ts';
import type { EcopagesWebSocketHandler } from '../../types/public-types.ts';

describe('matchWebSocketPath', () => {
	it('matches static paths with no params', () => {
		expect(matchWebSocketPath('/ws/chat', '/ws/chat')).toEqual({});
	});

	it('captures dynamic segments', () => {
		expect(matchWebSocketPath('/ws/chat/:roomId', '/ws/chat/lobby')).toEqual({ roomId: 'lobby' });
	});

	it('rejects length mismatches', () => {
		expect(matchWebSocketPath('/ws/chat/:roomId', '/ws/chat/lobby/extra')).toBeNull();
	});

	it('rejects literal segment mismatches', () => {
		expect(matchWebSocketPath('/ws/chat/:roomId', '/ws/other/lobby')).toBeNull();
	});
});

describe('scoreWebSocketPattern', () => {
	it('prefers more literal segments over dynamic ones', () => {
		expect(scoreWebSocketPattern('/ws/chat/lobby')).toBeGreaterThan(scoreWebSocketPattern('/ws/chat/:roomId'));
	});

	it('prefers longer routes when literal weight is equal', () => {
		expect(scoreWebSocketPattern('/ws/chat/:roomId/messages')).toBeGreaterThan(
			scoreWebSocketPattern('/ws/chat/:roomId'),
		);
	});
});

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
