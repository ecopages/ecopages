import { describe, expect, it } from 'vitest';
import {
	matchApiPathPattern,
	matchColonSegmentPath,
	matchExplicitStaticPathPattern,
	normalizeSegmentPath,
	scoreApiPathPattern,
	scoreColonSegmentPath,
} from './segment-path-matcher.ts';

describe('normalizeSegmentPath', () => {
	it('strips a trailing slash except for root', () => {
		expect(normalizeSegmentPath('/api/posts/')).toBe('/api/posts');
		expect(normalizeSegmentPath('/')).toBe('/');
	});
});

describe('matchApiPathPattern', () => {
	it('matches :param segments', () => {
		expect(matchApiPathPattern('/api/posts/:id', '/api/posts/42')).toEqual({ id: '42' });
	});

	it('matches [param] segments', () => {
		expect(matchApiPathPattern('/api/posts/[id]', '/api/posts/42')).toEqual({ id: '42' });
	});

	it('matches catch-all [...path] as string[]', () => {
		expect(matchApiPathPattern('/files/[...path]', '/files/a/b/c')).toEqual({ path: ['a', 'b', 'c'] });
	});

	it('matches empty catch-all when path ends at the catch-all segment', () => {
		expect(matchApiPathPattern('/files/[...path]', '/files')).toEqual({ path: [] });
	});

	it('tolerates trailing slash on pathname', () => {
		expect(matchApiPathPattern('/api/posts/[id]', '/api/posts/42/')).toEqual({ id: '42' });
	});

	it('returns null on segment mismatch', () => {
		expect(matchApiPathPattern('/api/posts/[id]', '/api/users/42')).toBeNull();
	});
});

describe('scoreApiPathPattern', () => {
	it('ranks literals above params above catch-alls', () => {
		expect(scoreApiPathPattern('/api/posts/latest')).toBeGreaterThan(scoreApiPathPattern('/api/posts/[id]'));
		expect(scoreApiPathPattern('/api/posts/[id]')).toBeGreaterThan(scoreApiPathPattern('/api/[...rest]'));
	});
});

describe('matchExplicitStaticPathPattern', () => {
	it('matches [param] and returns joined catch-all string', () => {
		expect(matchExplicitStaticPathPattern('/images/[name]', '/images/hero.webp')).toEqual({ name: 'hero.webp' });
		expect(matchExplicitStaticPathPattern('/assets/[...path]', '/assets/a/b.png')).toEqual({ path: 'a/b.png' });
	});

	it('supports :param and :...catchAll', () => {
		expect(matchExplicitStaticPathPattern('/img/:id', '/img/1')).toEqual({ id: '1' });
		expect(matchExplicitStaticPathPattern('/files/:...path', '/files/a/b')).toEqual({ path: 'a/b' });
	});
});

describe('matchColonSegmentPath / scoreColonSegmentPath', () => {
	it('matches exact colon params for websocket routes', () => {
		expect(matchColonSegmentPath('/ws/:room', '/ws/lobby')).toEqual({ room: 'lobby' });
		expect(matchColonSegmentPath('/ws/:room', '/ws/lobby/extra')).toBeNull();
	});

	it('scores more literals higher', () => {
		expect(scoreColonSegmentPath('/ws/chat/:room')).toBeGreaterThan(scoreColonSegmentPath('/ws/:kind/:room'));
	});
});
