/**
 * Window scroll behavior during client-side navigations.
 * @module
 */

export type WindowScrollBehavior = 'top' | 'preserve' | 'auto';

export type ManageWindowScrollOptions = {
	scrollBehavior: WindowScrollBehavior;
	smoothScroll: boolean;
};

/**
 * Updates window scroll position after a navigation commit.
 *
 * @remarks
 * Hash navigations always scroll to the target element and ignore `scrollBehavior`.
 * Fragment targets are resolved by element id (`#section` → `getElementById('section')`).
 */
export function manageWindowScroll(newUrl: URL, previousUrl: URL, options: ManageWindowScrollOptions): void {
	const { scrollBehavior, smoothScroll } = options;

	if (newUrl.hash) {
		const target = document.getElementById(newUrl.hash.slice(1));
		target?.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'instant' });
		return;
	}

	const behavior = smoothScroll ? 'smooth' : 'instant';

	switch (scrollBehavior) {
		case 'preserve':
			break;
		case 'auto':
			if (newUrl.pathname !== previousUrl.pathname) {
				window.scrollTo({ top: 0, left: 0, behavior });
			}
			break;
		case 'top':
		default:
			window.scrollTo({ top: 0, left: 0, behavior });
			break;
	}
}
