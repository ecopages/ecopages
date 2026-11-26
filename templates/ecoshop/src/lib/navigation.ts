/**
 * The window event a script dispatches to open a page; the layout's router claims it.
 */
export const NAVIGATE_EVENT = 'ecoshop:navigate';

export type NavigateDetail = { href: string; replace?: boolean };

/**
 * Opens `href` through the browser router when the layout has one, and with a full load otherwise. The router itself
 * loads a page on another site, such as the provider's checkout, in full.
 */
export function navigateTo(href: string, options: { replace?: boolean } = {}): void {
	const event = new CustomEvent<NavigateDetail>(NAVIGATE_EVENT, {
		cancelable: true,
		detail: { href, replace: options.replace },
	});
	if (window.dispatchEvent(event)) {
		if (options.replace) location.replace(href);
		else location.assign(href);
	}
}
