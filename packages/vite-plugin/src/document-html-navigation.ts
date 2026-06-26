/**
 * Vite-host helper for distinguishing top-level document loads from in-app morph fetches.
 *
 * Browser-router morph requests use `fetch()` with `Sec-Fetch-Mode: cors` and
 * `Sec-Fetch-Dest: empty`. Playwright and browser navigations use `navigate` /
 * `document`.
 */
export function isDocumentHtmlNavigationFromHeaders(getHeader: (name: string) => string | null): boolean {
	const dest = getHeader('sec-fetch-dest');
	if (dest === 'document' || dest === 'iframe') {
		return true;
	}

	return getHeader('sec-fetch-mode') === 'navigate';
}
