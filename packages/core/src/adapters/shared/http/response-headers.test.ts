import { describe, expect, it } from 'vitest';
import { applyResponseHeaders, assertResponseHeaderRules, matchesResponseHeaderSource } from './response-headers.ts';

describe('matchesResponseHeaderSource', () => {
	it.each([
		['/**', '/', true],
		['/**', '/a/b/c.js', true],
		['/about', '/about', true],
		['/about', '/about/team', false],
		['/assets/*', '/assets/app.js', true],
		['/assets/*', '/assets/deep/app.js', false],
		['/assets/**', '/assets/deep/app.js', true],
		['/assets/**', '/other/app.js', false],
		['/**/*.wasm', '/engine.wasm', true],
		['/**/*.wasm', '/a/b/engine.wasm', true],
		['/**/*.wasm', '/engine.js', false],
		['/file.js', '/fileXjs', false],
	])('matches %s against %s as %s', (source, pathname, expected) => {
		expect(matchesResponseHeaderSource(source, pathname)).toBe(expected);
	});
});

describe('assertResponseHeaderRules', () => {
	it('accepts valid rules', () => {
		expect(() => assertResponseHeaderRules([{ source: '/**', headers: { 'X-Test': 'a' } }])).not.toThrow();
	});

	it.each([
		['not an array', {}, /expected an array/],
		['a source without a leading slash', [{ source: 'assets/*', headers: {} }], /index 0.*starting with "\/"/],
		['an unsupported pattern', [{ source: '/a/{b,c}', headers: {} }], /unsupported pattern syntax/],
		['a bad header name', [{ source: '/', headers: { 'Bad Name': 'x' } }], /not a valid header name/],
		['a non-string value', [{ source: '/', headers: { 'X-Test': 1 } }], /must be a string/],
		['a line break in a value', [{ source: '/', headers: { 'X-Test': 'a\r\nb' } }], /without line breaks/],
	])('rejects %s', (_label, rules, message) => {
		expect(() => assertResponseHeaderRules(rules)).toThrow(message);
	});
});

describe('applyResponseHeaders', () => {
	const request = new Request('http://localhost/assets/app.js');

	it('keeps framework headers and adds matching ones', async () => {
		const response = new Response('body', {
			status: 201,
			headers: { 'Content-Type': 'text/javascript', ETag: '"x"' },
		});
		const result = applyResponseHeaders(response, request, [
			{ source: '/assets/*', headers: { 'Access-Control-Allow-Origin': '*' } },
			{ source: '/other/*', headers: { 'X-Other': '1' } },
		]);

		expect(result.status).toBe(201);
		expect(result.headers.get('Content-Type')).toBe('text/javascript');
		expect(result.headers.get('ETag')).toBe('"x"');
		expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(result.headers.has('X-Other')).toBe(false);
		expect(await result.text()).toBe('body');
	});

	it('lets a configured header override a same-named one, and a later rule override an earlier one', () => {
		const response = new Response(null, { headers: { 'Cache-Control': 'no-cache' } });
		const result = applyResponseHeaders(response, request, [
			{ source: '/**', headers: { 'Cache-Control': 'public', 'X-A': '1' } },
			{ source: '/assets/*', headers: { 'X-A': '2' } },
		]);

		expect(result.headers.get('Cache-Control')).toBe('public');
		expect(result.headers.get('X-A')).toBe('2');
	});

	it('returns the same response when no rule matches', () => {
		const response = new Response('x');
		expect(applyResponseHeaders(response, request, [{ source: '/nope', headers: { 'X-A': '1' } }])).toBe(response);
		expect(applyResponseHeaders(response, request, undefined)).toBe(response);
	});

	it('works on a response with immutable headers', () => {
		const result = applyResponseHeaders(Response.redirect('http://localhost/x', 302), request, [
			{ source: '/**', headers: { 'X-A': '1' } },
		]);
		expect(result.status).toBe(302);
		expect(result.headers.get('Location')).toBe('http://localhost/x');
		expect(result.headers.get('X-A')).toBe('1');
	});
});
