import { isHtmlPageResponse } from './link-navigation-policy.ts';

export type FetchedNavigationPage = {
	requestedUrl: URL;
	finalUrl: URL;
	html: string;
	document: Document;
};

export type FetchNavigationPageOptions = {
	signal?: AbortSignal;
	bypassCache?: boolean;
	priority?: 'high' | 'low' | 'auto';
};

const navigationHtmlCache = new Map<string, string>();
const finalUrlByRequest = new Map<string, string>();

function getCacheKey(href: string | URL): string {
	const url = new URL(href, window.location.href);
	url.hash = '';
	return url.href;
}

export function getCachedNavigationHtml(href: string | URL): string | null {
	return navigationHtmlCache.get(getCacheKey(href)) ?? null;
}

export function cacheNavigationHtml(href: string | URL, html: string, finalHref: string | URL = href): void {
	const requestedKey = getCacheKey(href);
	const finalKey = getCacheKey(finalHref);
	navigationHtmlCache.set(requestedKey, html);
	navigationHtmlCache.set(finalKey, html);
	finalUrlByRequest.set(requestedKey, finalKey);
	finalUrlByRequest.set(finalKey, finalKey);
}

/**
 * Drops the cached document for a URL, its redirect target, and every other
 * requested URL that redirected to the same target.
 */
export function invalidateNavigationHtml(href: string | URL): void {
	const key = getCacheKey(href);
	const finalKey = finalUrlByRequest.get(key) ?? key;
	for (const [requestKey, mappedFinalKey] of finalUrlByRequest) {
		if (mappedFinalKey === finalKey) {
			navigationHtmlCache.delete(requestKey);
			finalUrlByRequest.delete(requestKey);
		}
	}
	navigationHtmlCache.delete(key);
	navigationHtmlCache.delete(finalKey);
}

/**
 * Reports whether a response's `Cache-Control` forbids serving its body without asking the server again.
 *
 * @remarks
 * `no-store` and an unqualified `no-cache` forbid reuse. The navigation cache never revalidates, so a
 * response that must be revalidated on every use cannot come from it. `max-age=0` and `must-revalidate`
 * alone do not: a static page is sent that way and is meant to be reused for the session. A qualified
 * `no-cache="field"` only covers the named header fields and leaves the body reusable.
 */
function forbidsReuse(headers: Headers): boolean {
	const directives = (headers.get('Cache-Control') ?? '').toLowerCase().split(',');
	return directives.some((directive) => {
		const name = directive.trim();
		return name === 'no-store' || name === 'no-cache';
	});
}

/**
 * Parses a fetched document with an absolute base URL for relative assets.
 *
 * @remarks
 * An incoming page's own `<base>` wins. A temporary base is only added when
 * the page has none so asset and module URLs resolve against the final URL.
 */
export function parseNavigationDocument(html: string, finalUrl: URL): Document {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const base = doc.querySelector<HTMLBaseElement>('base[href]');

	if (base) {
		base.href = new URL(base.getAttribute('href') ?? '', finalUrl).href;
	} else {
		const injectedBase = doc.createElement('base');
		injectedBase.href = finalUrl.href;
		injectedBase.setAttribute('data-eco-injected', '');
		doc.head.prepend(injectedBase);
	}

	return doc;
}

/**
 * Fetches, validates, caches, and parses an HTML document for client navigation.
 *
 * @remarks
 * The requested fragment is restored after redirects because fragments are not
 * sent in HTTP requests. Cached HTML is shared by browser-router prefetch and
 * both navigation runtimes. A response with `Cache-Control: no-store` or an unqualified `no-cache` is parsed
 * and returned but not cached, and any copy held for its URLs is dropped, so the next navigation to that URL
 * fetches it again.
 */
export async function fetchNavigationPage(
	href: string | URL,
	options: FetchNavigationPageOptions = {},
): Promise<FetchedNavigationPage | null> {
	const requestedUrl = new URL(href, window.location.href);
	const requestCacheKey = getCacheKey(requestedUrl);
	let html = options.bypassCache ? null : getCachedNavigationHtml(requestedUrl);
	const cachedFinalHref = finalUrlByRequest.get(requestCacheKey);
	let finalUrl = new URL(cachedFinalHref ?? requestedUrl.href);
	if (requestedUrl.hash) {
		finalUrl.hash = requestedUrl.hash;
	}

	if (html === null) {
		const requestUrl = new URL(requestedUrl);
		requestUrl.hash = '';
		const fetchOptions: RequestInit & { priority?: 'high' | 'low' | 'auto' } = {
			signal: options.signal,
			cache: 'no-store',
			headers: { Accept: 'text/html' },
		};
		if (options.priority) fetchOptions.priority = options.priority;
		const response = await fetch(requestUrl.href, fetchOptions);

		if (!response.ok || !isHtmlPageResponse(response)) {
			return null;
		}

		html = await response.text();
		finalUrl = new URL(response.url || requestUrl.href, requestUrl);
		if (requestedUrl.hash) {
			finalUrl.hash = requestedUrl.hash;
		}
		if (forbidsReuse(response.headers)) {
			invalidateNavigationHtml(requestedUrl);
			invalidateNavigationHtml(finalUrl);
		} else {
			cacheNavigationHtml(requestedUrl, html, finalUrl);
		}
	}

	return {
		requestedUrl,
		finalUrl,
		html,
		document: parseNavigationDocument(html, finalUrl),
	};
}

/** Clears cached navigation HTML and redirect mappings. */
export function clearNavigationHtmlCache(): void {
	navigationHtmlCache.clear();
	finalUrlByRequest.clear();
}
