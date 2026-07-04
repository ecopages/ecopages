/**
 * Escapes page data JSON for safe embedding in HTML script bodies.
 */
export function escapePageDataJson(pageProps: Record<string, unknown> | undefined): string {
	return JSON.stringify(pageProps ?? {}).replace(/</g, '\\u003c');
}

/**
 * Emits the canonical `__ECO_PAGE_DATA__` bootstrap script tag.
 */
export function serializePageDataScript(pageProps: Record<string, unknown> | undefined): string {
	return `<script id="__ECO_PAGE_DATA__" type="application/json">${escapePageDataJson(pageProps)}</script>`;
}
