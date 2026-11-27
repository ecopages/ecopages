import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors/http-error.ts';
import {
	buildSegmentPath,
	matchSegmentPath,
	compileSegmentPattern,
	segmentPathPatternKey,
} from './segment-path-matcher.ts';

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

	it('matches a param with a literal suffix only on segments that end with it', () => {
		expect(matchSegmentPath('/products/:handle.md', '/products/linen-shirt.md', 'explicit')).toEqual({
			handle: 'linen-shirt',
		});
		expect(matchSegmentPath('/products/:handle.md', '/products/linen-shirt', 'explicit')).toBeNull();
		expect(matchSegmentPath('/products/:handle.md', '/products/linen-shirt.mdx', 'explicit')).toBeNull();
		expect(matchSegmentPath('/products/:handle.md', '/products/.md', 'explicit')).toBeNull();
		expect(matchSegmentPath('/products/:handle.md', '/products/a.b.md', 'api')).toEqual({ handle: 'a.b' });
		expect(matchSegmentPath('/products/:handle.md/raw', '/products/a.md/raw', 'api')).toEqual({ handle: 'a' });
		expect(matchSegmentPath('/products/:handle.md', '/products/caf%C3%A9.md', 'api')).toEqual({ handle: 'café' });
	});

	it('accepts the bracket spelling of a suffixed param where brackets are params', () => {
		expect(matchSegmentPath('/products/[handle].md', '/products/linen-shirt.md', 'api')).toEqual({
			handle: 'linen-shirt',
		});
		expect(matchSegmentPath('/products/[handle].md', '/products/linen-shirt.md', 'filesystem')).toEqual({
			handle: 'linen-shirt',
		});
		expect(matchSegmentPath('/products/[handle].md', '/products/linen-shirt', 'filesystem')).toBeNull();
		expect(matchSegmentPath('/products/:handle.md', '/products/linen-shirt.md', 'websocket')).toEqual({
			handle: 'linen-shirt',
		});
	});

	it('keeps a dot after a catch-all name as part of that name', () => {
		expect(matchSegmentPath('/files/:...path.md', '/files/a/b', 'explicit')).toEqual({ 'path.md': 'a/b' });
	});

	it('reads a dot with nothing after it, and a catch-all with text after it, as literal segments', () => {
		expect(matchSegmentPath('/x/:a.', '/x/:a.', 'api')).toEqual({});
		expect(matchSegmentPath('/x/[a].', '/x/[a].', 'api')).toEqual({});
		expect(matchSegmentPath('/x/[...path].md', '/x/[...path].md', 'api')).toEqual({});
	});

	it('refuses a suffix that holds another param marker', () => {
		for (const pattern of ['/x/:name.:ext', '/x/:name.[ext]', '/x/[slug].[format]', '/x/[slug].a]']) {
			expect(() => compileSegmentPattern(pattern, 'api')).toThrow('literal suffix');
		}
	});

	it('builds pathnames from a suffixed param', () => {
		expect(buildSegmentPath('/products/:handle.md', { handle: 'linen-shirt' }, 'explicit')).toBe(
			'/products/linen-shirt.md',
		);
		expect(buildSegmentPath('/products/[handle].md', { handle: 'linen-shirt' }, 'filesystem')).toBe(
			'/products/linen-shirt.md',
		);
		expect(buildSegmentPath('/products/:handle.md', {}, 'explicit')).toBe('/products/:handle.md');
	});

	it('ranks a suffixed WebSocket param before a bare one, whatever the registration order', () => {
		const score = (pattern: string) => compileSegmentPattern(pattern, 'websocket').score;

		expect(score('/ws/:id.json')).toBeGreaterThan(score('/ws/:id'));
		expect(score('/ws/lobby')).toBeGreaterThan(score('/ws/:id.json'));
	});

	it('builds a suffix as the pattern wrote it, so an encoded character stays encoded', () => {
		const built = buildSegmentPath('/posts/[slug].%23raw', { slug: 'hello' }, 'filesystem');

		expect(built).toBe('/posts/hello.%23raw');
		expect(matchSegmentPath('/posts/[slug].%23raw', built, 'filesystem')).toEqual({ slug: 'hello' });
	});

	it('ranks a suffixed param between a literal and a bare param', () => {
		const score = (pattern: string) => compileSegmentPattern(pattern, 'api').score;

		expect(score('/products/latest')).toBeGreaterThan(score('/products/:handle.md'));
		expect(score('/products/:handle.md')).toBeGreaterThan(score('/products/:handle'));
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
		expect(compileSegmentPattern('/api/posts/latest', 'api').score).toBeGreaterThan(
			compileSegmentPattern('/api/posts/[id]', 'api').score,
		);
		expect(compileSegmentPattern('/ws/chat/lobby', 'websocket').score).toBeGreaterThan(
			compileSegmentPattern('/ws/chat/:room', 'websocket').score,
		);
	});
});

describe('segmentPathPatternKey', () => {
	it.each([
		['/blog/:slug/comments', 'api', '/blog/[slug]/comments', 'filesystem'],
		['/docs/*', 'api', '/docs/[...path]', 'filesystem'],
		['/a%20b/:id', 'api', '/a b/[id]', 'filesystem'],
		['/blog/:slug.md', 'api', '/blog/[post].md', 'filesystem'],
	] as const)('gives %s and %s the same key', (left, leftSyntax, right, rightSyntax) => {
		expect(segmentPathPatternKey(left, leftSyntax)).toBe(segmentPathPatternKey(right, rightSyntax));
	});

	it.each([
		['/blog/:slug', '/blog/[...slug]'],
		['/blog/:slug', '/blog/slug'],
		['/blog/:slug', '/blog/[slug]/comments'],
		['/blog/:slug', '/blog/[slug].md'],
		['/blog/:slug.md', '/blog/[slug].txt'],
	])('gives %s and %s different keys', (left, right) => {
		expect(segmentPathPatternKey(left, 'api')).not.toBe(segmentPathPatternKey(right, 'filesystem'));
	});
});
