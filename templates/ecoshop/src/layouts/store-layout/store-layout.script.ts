import { createRouter } from '@ecopages/browser-router/client';
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
