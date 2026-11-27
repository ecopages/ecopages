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
 * The order page uses it after a cart change made by a tool, so the lines on screen are the ones the store holds.
 */
export async function reloadCurrentPage(): Promise<void> {
	const handled = await getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: true });
	if (!handled) window.location.reload();
}
