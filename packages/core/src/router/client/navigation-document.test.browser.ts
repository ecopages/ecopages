import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNavigationHtmlCache, fetchNavigationPage, parseNavigationDocument } from './navigation-document.ts';

afterEach(() => {
	clearNavigationHtmlCache();
	vi.unstubAllGlobals();
});

describe('shared navigation document loading', () => {
	it('checks HTML status, keeps the fragment through redirects, and resolves the incoming base', async () => {
		const response = new Response('<html><head><base href="../assets/"></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
		Object.defineProperty(response, 'url', { value: 'https://example.test/docs/current/' });
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		const page = await fetchNavigationPage('https://example.test/old/page#install');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/old/page',
			expect.objectContaining({ headers: { Accept: 'text/html' } }),
		);
		expect(page?.finalUrl.href).toBe('https://example.test/docs/current/#install');
		expect(page?.document.querySelector('base')?.href).toBe('https://example.test/docs/assets/');
	});

	it('shares cached HTML and the redirect target across router loads', async () => {
		const response = new Response('<html><head></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
		Object.defineProperty(response, 'url', { value: 'https://example.test/docs/' });
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		const firstPage = await fetchNavigationPage('https://example.test/old/#one');
		const cachedPage = await fetchNavigationPage('https://example.test/old/#two');

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(firstPage?.finalUrl.href).toBe('https://example.test/docs/#one');
		expect(cachedPage?.finalUrl.href).toBe('https://example.test/docs/#two');
	});

	it('passes low fetch priority through for prefetch requests', async () => {
		const response = new Response('<html><head></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		await fetchNavigationPage('https://example.test/prefetched', { priority: 'low' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/prefetched',
			expect.objectContaining({ priority: 'low' }),
		);
	});

	it('rejects non-HTML and non-success responses', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('missing', { status: 404, headers: { 'Content-Type': 'text/html' } }))
			.mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchNavigationPage('https://example.test/missing')).toBeNull();
		expect(await fetchNavigationPage('https://example.test/data')).toBeNull();
	});

	it('adds a temporary base only when the page has none', () => {
		const document = parseNavigationDocument(
			'<html><head></head><body><a href="child">Child</a></body></html>',
			new URL('https://example.test/docs/'),
		);

		expect(document.querySelector<HTMLBaseElement>('base[data-eco-injected]')?.href).toBe(
			'https://example.test/docs/',
		);
		expect(document.querySelector('a')?.getAttribute('href')).toBe('child');
	});
});
