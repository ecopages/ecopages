import { createRouter } from '@ecopages/browser-router/client';
import { getEcoNavigationRuntime } from '@ecopages/core/client';

/** Opens `url` as a client navigation, resolving once the new page is on screen. */
export async function navigate(url: string): Promise<void> {
	await createRouter().navigate(url);
}

/**
 * Renders the current page again from the server, skipping the router's page cache.
 *
 * @remarks
 * The order page renders per request, but the browser router keeps every page it fetched; after a cart change
 * the cached copy would show the old cart.
 */
export async function reloadCurrentPage(): Promise<void> {
	const handled = await getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: true });
	if (!handled) window.location.reload();
}
