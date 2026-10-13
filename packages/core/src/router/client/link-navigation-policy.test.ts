import { describe, expect, it } from 'vitest';
import { isHtmlPageResponse, isSamePageHref } from './link-navigation-policy.ts';

describe('isHtmlPageResponse', () => {
	it.each([
		{ contentType: 'text/html; charset=utf-8', expected: true },
		{ contentType: 'text/html', expected: true },
		{ contentType: 'Text/HTML', expected: true },
		{ contentType: 'application/xhtml+xml', expected: true },
		{ contentType: 'text/plain', expected: false },
		{ contentType: 'text/markdown', expected: false },
		{ contentType: 'application/json', expected: false },
		{ contentType: null, expected: false },
	])('answers $expected for $contentType', ({ contentType, expected }) => {
		const headers = contentType === null ? undefined : { 'Content-Type': contentType };
		expect(isHtmlPageResponse(new Response(null, { headers }))).toBe(expected);
	});
});

describe('isSamePageHref', () => {
	const current = 'http://localhost:3000/docs/page?tab=a';

	it.each([
		{ href: '/docs/page?tab=a', expected: true },
		{ href: '/docs/page?tab=a#section', expected: true },
		{ href: 'page?tab=a', expected: true },
		{ href: '/docs/page?tab=b', expected: false },
		{ href: '/docs/other?tab=a', expected: false },
		{ href: 'http://example.com/docs/page?tab=a', expected: false },
		{ href: '', expected: false },
	])('answers $expected for $href', ({ href, expected }) => {
		expect(isSamePageHref(href, current)).toBe(expected);
	});
});
