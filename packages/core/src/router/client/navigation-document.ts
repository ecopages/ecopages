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

type CachedNavigationHtml = {
	html: string;
	/** `Date.now()` when the copy was fetched. */
	fetchedAt: number;
	/** Milliseconds the copy may be reused for, or `null` when the response set no limit. */
	maxAgeMs: number | null;
};

const navigationHtmlCache = new Map<string, CachedNavigationHtml>();
const finalUrlByRequest = new Map<string, string>();

function getCacheKey(href: string | URL): string {
	const url = new URL(href, window.location.href);
	url.hash = '';
	return url.href;
}

/**
 * Returns the cached document for a URL, or `null` when none is held or the copy outlived its `max-age`.
 *
 * @remarks
 * An expired copy is dropped with its redirect aliases, so the caller fetches the page again.
 */
export function getCachedNavigationHtml(href: string | URL): string | null {
	const key = getCacheKey(href);
	const entry = navigationHtmlCache.get(key);
	if (!entry) return null;
	if (entry.maxAgeMs !== null && Date.now() - entry.fetchedAt > entry.maxAgeMs) {
		invalidateNavigationHtml(key);
		return null;
	}
	return entry.html;
}

/**
 * Stores a fetched document under its requested and final URLs.
 *
 * @param options.maxAge - Seconds the copy may be reused for, counted from now; no limit when omitted
 */
export function cacheNavigationHtml(
	href: string | URL,
	html: string,
	finalHref: string | URL = href,
	options: { maxAge?: number | null } = {},
): void {
	const requestedKey = getCacheKey(href);
	const finalKey = getCacheKey(finalHref);
	const entry: CachedNavigationHtml = {
		html,
		fetchedAt: Date.now(),
		maxAgeMs: options.maxAge == null ? null : options.maxAge * 1000,
	};
	navigationHtmlCache.set(requestedKey, entry);
	navigationHtmlCache.set(finalKey, entry);
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
 * Reads how many seconds a response's `Cache-Control` lets its body be reused, or `null` for no limit.
 *
 * @remarks
 * Only a positive `max-age` limits reuse. `max-age=0` is how a static Page is sent, with `must-revalidate`,
 * and that page is meant to be reused for the session, so zero means no limit here as well. `s-maxage` is
 * for shared caches and is ignored.
 */
function readMaxAge(headers: Headers): number | null {
	const match = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?\s*(?:,|$)/i.exec(headers.get('Cache-Control') ?? '');
	const seconds = match ? Number(match[1]) : 0;
	return seconds > 0 ? seconds : null;
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
 * fetches it again. A copy older than the positive `max-age` of its response counts as missing, so a page
 * sent with `{ revalidate: N }` is fetched again once N seconds have passed.
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
			cacheNavigationHtml(requestedUrl, html, finalUrl, { maxAge: readMaxAge(response.headers) });
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
