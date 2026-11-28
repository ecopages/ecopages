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
	/**
	 * Marks the fetch as a prefetch, ahead of a click that may never come.
	 *
	 * @remarks
	 * A response that forbids reuse is held for {@link HELD_NAVIGATION_HTML_MS} and handed to the next
	 * navigation fetch of the same URL, once. A navigation fetch that starts while the prefetch is still in
	 * flight waits for it, so a hover and the click that follows make one request instead of two. A prefetch a
	 * newer fetch of the same URL has overtaken stores nothing.
	 */
	prefetch?: boolean;
};

/**
 * How long a prefetched page that forbids reuse waits for its click.
 *
 * @remarks
 * Long enough for a visitor to go from hovering a link to pressing it, short enough that the page the
 * click shows is still the page the visitor saw the link for. The copy is used once, never twice.
 */
const HELD_NAVIGATION_HTML_MS = 5000;

type CachedNavigationHtml = {
	html: string;
	/** `Date.now()` when the copy was fetched. */
	fetchedAt: number;
	/** Milliseconds the copy may be reused for, or `null` when the response set no limit. */
	maxAgeMs: number | null;
};

type HeldNavigationHtml = {
	html: string;
	finalHref: string;
	expiresAt: number;
};

const navigationHtmlCache = new Map<string, CachedNavigationHtml>();
const heldNavigationHtml = new Map<string, HeldNavigationHtml>();
const finalUrlByRequest = new Map<string, string>();
const pendingPrefetches = new Map<string, Promise<void>>();
const latestNetworkFetch = new Map<string, number>();
let networkFetchSequence = 0;

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
	options: { maxAge?: number } = {},
): void {
	const requestedKey = getCacheKey(href);
	const finalKey = getCacheKey(finalHref);
	const entry: CachedNavigationHtml = {
		html,
		fetchedAt: Date.now(),
		maxAgeMs: options.maxAge === undefined ? null : options.maxAge * 1000,
	};
	navigationHtmlCache.set(requestedKey, entry);
	navigationHtmlCache.set(finalKey, entry);
	finalUrlByRequest.set(requestedKey, finalKey);
	finalUrlByRequest.set(finalKey, finalKey);
}

/**
 * Drops the cached document for a URL, its redirect target, and every other
 * requested URL that redirected to the same target.
 *
 * @remarks
 * A prefetch of the URL still in flight is disowned: it stores nothing, and a navigation does not wait for it,
 * so the next navigation fetches a page newer than the invalidation.
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
	for (const urlKey of new Set([key, finalKey])) {
		latestNetworkFetch.set(urlKey, ++networkFetchSequence);
		pendingPrefetches.delete(urlKey);
	}
	for (const [heldKey, held] of heldNavigationHtml) {
		if (heldKey === key || heldKey === finalKey || held.finalHref === finalKey) {
			heldNavigationHtml.delete(heldKey);
		}
	}
}

/** Removes and returns the copy a prefetch held for a URL, or `null` when none is held or it timed out. */
function takeHeldNavigationHtml(key: string): HeldNavigationHtml | null {
	const held = heldNavigationHtml.get(key);
	heldNavigationHtml.delete(key);
	return held && held.expiresAt >= Date.now() ? held : null;
}

type NavigationCacheControl = {
	/** Whether the body may not be served again without asking the server. */
	forbidsReuse: boolean;
	/** Seconds the body may be reused for, or `undefined` when the response sets no limit. */
	maxAge: number | undefined;
	/** Whether a shared cache's `Age` had already used up the `max-age` when the body arrived. */
	staleOnArrival: boolean;
};

/**
 * Reads what a response's `Cache-Control` and `Age` let the navigation cache do with its body.
 *
 * @remarks
 * `no-store` and an unqualified `no-cache` forbid reuse. The navigation cache never revalidates, so a
 * response that must be revalidated on every use cannot come from it. `max-age=0` and `must-revalidate`
 * alone do not: a static page is sent that way and is meant to be reused for the session, so only a positive
 * `max-age` limits reuse. A qualified `no-cache="field"` only covers the named header fields and leaves the
 * body reusable. A shared cache in front of the server reports the time it already held the body in `Age`,
 * which counts against the `max-age`; a body that arrives with none of it left is stale on arrival. `s-maxage`
 * is for shared caches and is ignored.
 */
function readCacheControl(headers: Headers): NavigationCacheControl {
	let forbidsReuse = false;
	let maxAge = 0;
	for (const directive of (headers.get('Cache-Control') ?? '').toLowerCase().split(',')) {
		const name = directive.trim();
		if (name === 'no-store' || name === 'no-cache') forbidsReuse = true;
		const match = /^max-age\s*=\s*"?(\d+)"?$/.exec(name);
		if (match) maxAge = Number(match[1]);
	}
	if (maxAge <= 0) return { forbidsReuse, maxAge: undefined, staleOnArrival: false };

	const age = Number.parseInt(headers.get('Age') ?? '', 10);
	const remaining = maxAge - (Number.isFinite(age) && age > 0 ? age : 0);
	return { forbidsReuse, maxAge: remaining, staleOnArrival: remaining <= 0 };
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
 * Keeps a fetched document for later navigations as its `Cache-Control` allows.
 *
 * @remarks
 * A page that forbids reuse stays out of the cache and any copy held for its URLs is dropped. When the fetch
 * was a prefetch, that one response is kept in the one-use hold instead, so the click it was fetched for does
 * not request the page again.
 */
function storeFetchedHtml(requestedUrl: URL, html: string, finalUrl: URL, headers: Headers, prefetch: boolean): void {
	const { forbidsReuse, maxAge, staleOnArrival } = readCacheControl(headers);
	if (!forbidsReuse && !staleOnArrival) {
		cacheNavigationHtml(requestedUrl, html, finalUrl, { maxAge });
		return;
	}

	invalidateNavigationHtml(requestedUrl);
	invalidateNavigationHtml(finalUrl);
	if (!prefetch || !forbidsReuse) return;

	const now = Date.now();
	for (const [heldKey, held] of heldNavigationHtml) {
		if (held.expiresAt < now) heldNavigationHtml.delete(heldKey);
	}
	const finalHref = new URL(finalUrl);
	finalHref.hash = '';
	heldNavigationHtml.set(getCacheKey(requestedUrl), {
		html,
		finalHref: finalHref.href,
		expiresAt: Date.now() + HELD_NAVIGATION_HTML_MS,
	});
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
 * sent with `{ revalidate: N }` is fetched again once N seconds have passed. A `prefetch` of a page that forbids
 * reuse is the one exception to not caching it: the copy waits a few seconds for the click and answers one
 * navigation fetch, so a hover and its click request the page once. A navigation fetch that finds a prefetch of
 * its URL still in flight waits for it first, and one that bypasses the cache neither waits nor reads the hold.
 */
export async function fetchNavigationPage(
	href: string | URL,
	options: FetchNavigationPageOptions = {},
): Promise<FetchedNavigationPage | null> {
	const requestedUrl = new URL(href, window.location.href);
	const requestCacheKey = getCacheKey(requestedUrl);

	if (options.prefetch) {
		const load = loadNavigationPage(requestedUrl, options);
		const settled = load.then(
			() => undefined,
			() => undefined,
		);
		pendingPrefetches.set(requestCacheKey, settled);
		try {
			return await load;
		} finally {
			if (pendingPrefetches.get(requestCacheKey) === settled) pendingPrefetches.delete(requestCacheKey);
		}
	}

	const pending = options.bypassCache ? undefined : pendingPrefetches.get(requestCacheKey);
	if (pending) {
		await waitUnlessAborted(pending, options.signal);
	}
	return loadNavigationPage(requestedUrl, options);
}

/** Waits for `pending`, and rejects as soon as `signal` aborts, so a cancelled navigation does not hold up the next. */
async function waitUnlessAborted(pending: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
	if (!signal) {
		await pending;
		return;
	}
	signal.throwIfAborted();
	let onAbort: (() => void) | undefined;
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
	});
	try {
		await Promise.race([pending, aborted]);
	} finally {
		if (onAbort) signal.removeEventListener('abort', onAbort);
	}
}

/**
 * Returns the copy a navigation may use without a request: a cached one, or, for a navigation fetch, the copy a
 * prefetch held for its URL, which this call uses up.
 */
function readReusableHtml(
	requestedUrl: URL,
	key: string,
	prefetch: boolean,
): { html: string; finalHref: string | undefined } | null {
	const html = getCachedNavigationHtml(requestedUrl);
	if (html !== null) return { html, finalHref: finalUrlByRequest.get(key) };

	const held = prefetch ? null : takeHeldNavigationHtml(key);
	return held ? { html: held.html, finalHref: held.finalHref } : null;
}

/**
 * Reports whether a fetch that started as number `sequence` has been overtaken: a later fetch or an
 * invalidation of its requested URL, or a later fetch of the URL it redirected to, makes its response older.
 */
function isOvertaken(requestKey: string, finalKey: string, sequence: number): boolean {
	return latestNetworkFetch.get(requestKey) !== sequence || (latestNetworkFetch.get(finalKey) ?? 0) > sequence;
}

async function loadNavigationPage(
	requestedUrl: URL,
	options: FetchNavigationPageOptions,
): Promise<FetchedNavigationPage | null> {
	const requestCacheKey = getCacheKey(requestedUrl);
	const reusable = options.bypassCache
		? null
		: readReusableHtml(requestedUrl, requestCacheKey, options.prefetch === true);
	let html = reusable?.html ?? null;
	const cachedFinalHref = reusable?.finalHref;
	let finalUrl = new URL(cachedFinalHref ?? requestedUrl.href);
	if (requestedUrl.hash) {
		finalUrl.hash = requestedUrl.hash;
	}

	if (html === null) {
		const sequence = ++networkFetchSequence;
		latestNetworkFetch.set(requestCacheKey, sequence);
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
		const overtaken = options.prefetch === true && isOvertaken(requestCacheKey, getCacheKey(finalUrl), sequence);
		if (!overtaken) {
			storeFetchedHtml(requestedUrl, html, finalUrl, response.headers, options.prefetch === true);
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
	heldNavigationHtml.clear();
	finalUrlByRequest.clear();
	latestNetworkFetch.clear();
}
