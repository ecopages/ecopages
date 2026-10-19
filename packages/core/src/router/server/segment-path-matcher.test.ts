import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors/http-error.ts';
import { buildSegmentPath, matchSegmentPath, scoreSegmentPathPattern } from './segment-path-matcher.ts';

describe('matchSegmentPath', () => {
	it('matches filesystem routes and decodes each segment once', () => {
		expect(matchSegmentPath('/blog/[slug]', '/blog/caf%C3%A9', 'filesystem')).toEqual({ slug: 'café' });
		expect(matchSegmentPath('/blog/[slug]', '/blog/%252F', 'filesystem')).toEqual({ slug: '%2F' });
	});

	it('decodes literal route segments before comparing them', () => {
		expect(matchSegmentPath('/café', '/caf%C3%A9', 'filesystem')).toEqual({});
		expect(matchSegmentPath('/api/caf%C3%A9', '/api/caf%C3%A9', 'api')).toEqual({});
		expect(matchSegmentPath('/api/café', '/api/caf%C3%A9', 'api')).toEqual({});
		expect(matchSegmentPath('/files/a%2Fb', '/files/a%2Fb', 'explicit')).toEqual({});
		expect(matchSegmentPath('/ws/caf%C3%A9', '/ws/caf%C3%A9', 'websocket')).toEqual({});
	});

	it('keeps an encoded slash inside its catch-all segment', () => {
		expect(matchSegmentPath('/docs/[...path]', '/docs/a%2Fb/c', 'filesystem')).toEqual({ path: ['a/b', 'c'] });
	});

	it('matches API bracket and colon parameters, wildcards, and catch-alls', () => {
		expect(matchSegmentPath('/api/posts/:id', '/api/posts/42', 'api')).toEqual({ id: '42' });
		expect(matchSegmentPath('/api/posts/[id]', '/api/posts/42', 'api')).toEqual({ id: '42' });
		expect(matchSegmentPath('/files/[...path]', '/files/a/b', 'api')).toEqual({ path: ['a', 'b'] });
		expect(matchSegmentPath('/files/[...path]', '/files', 'api')).toEqual({ path: [] });
		expect(matchSegmentPath('/api/*', '/api/anything/here', 'api')).toEqual({});
	});

	it('matches explicit route catch-alls as joined strings', () => {
		expect(matchSegmentPath('/files/:...path', '/files/a%2Fb/c', 'explicit')).toEqual({ path: 'a/b/c' });
	});

	it('keeps WebSocket route syntax colon-only', () => {
		expect(matchSegmentPath('/ws/:room', '/ws/caf%C3%A9', 'websocket')).toEqual({ room: 'café' });
		expect(matchSegmentPath('/ws/[room]', '/ws/value', 'websocket')).toBeNull();
	});

	it('throws an HTTP 400 for malformed path escapes', () => {
		try {
			matchSegmentPath('/blog/[slug]', '/blog/%E0%A4%A', 'filesystem');
			expect.fail('expected the malformed path to be rejected');
		} catch (error) {
			expect(HttpError.isHttpError(error)).toBe(true);
			expect(error).toMatchObject({ status: 400 });
		}
	});

	it('builds pathnames from every param and catch-all spelling', () => {
		expect(buildSegmentPath('/blog/[slug]', { slug: 'hello' }, 'filesystem')).toBe('/blog/hello');
		expect(buildSegmentPath('/docs/[...path]', { path: ['a', 'b'] }, 'filesystem')).toBe('/docs/a/b');
		expect(buildSegmentPath('/files/:...path', { path: 'a/b' }, 'explicit')).toBe('/files/a/b');
		expect(buildSegmentPath('/files/:...path', { path: ['a', 'b'] }, 'explicit')).toBe('/files/a/b');
		expect(buildSegmentPath('/[lang]/:slug', { lang: 'en', slug: 'x' }, 'explicit')).toBe('/en/x');
	});

	it('builds pathnames segment by segment so one param name never rewrites another', () => {
		expect(buildSegmentPath('/:idx/:id', { id: '2', idx: '1x' }, 'explicit')).toBe('/1x/2');
		expect(buildSegmentPath('/[idx]/[id]', { id: '2', idx: '1x' }, 'filesystem')).toBe('/1x/2');
	});

	it('drops an empty catch-all and keeps segments without a param value', () => {
		expect(buildSegmentPath('/docs/[...path]', { path: [] }, 'filesystem')).toBe('/docs');
		expect(buildSegmentPath('/blog/[slug]', {}, 'filesystem')).toBe('/blog/[slug]');
	});

	it('ranks literal API and WebSocket routes ahead of parameter routes', () => {
		expect(scoreSegmentPathPattern('/api/posts/latest', 'api')).toBeGreaterThan(
			scoreSegmentPathPattern('/api/posts/[id]', 'api'),
		);
		expect(scoreSegmentPathPattern('/ws/chat/lobby', 'websocket')).toBeGreaterThan(
			scoreSegmentPathPattern('/ws/chat/:room', 'websocket'),
		);
	});
});
