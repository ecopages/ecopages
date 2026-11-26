import { createRouter } from '@ecopages/browser-router/client';
import { clearNavigationHtmlCache } from '@ecopages/core/client';
import { CART_CHANGE_EVENT } from '../../lib/cart/cart-events';
import { NAVIGATE_EVENT, type NavigateDetail } from '../../lib/navigation';

const router = createRouter({
	viewTransitions: true,
});

/**
 * Opens the page through the router, so persisted hosts such as the agent tools stay connected; the router loads a
 * page on another site in full. Claiming the event with `preventDefault()` tells the sender not to load it itself.
 */
window.addEventListener(NAVIGATE_EVENT, (event) => {
	const { href, replace } = (event as CustomEvent<NavigateDetail>).detail;
	event.preventDefault();
	void router.navigate(href, { replace });
});

/**
 * Drops the router's copies of every page when a script changes the cart, so the next visit fetches it. The cart
 * page can be cached under several URLs, such as `/cart?notice=...`, and a back navigation reuses any of them.
 *
 * @remarks
 * The router keeps each page it fetched for the rest of the session and does not read the page's
 * `Cache-Control: no-store`.
 */
window.addEventListener(CART_CHANGE_EVENT, () => clearNavigationHtmlCache());
