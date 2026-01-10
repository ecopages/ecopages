/**
 * View transition utilities for applying transition names from data attributes.
 * @module
 */

const VIEW_TRANSITION_ATTR = 'data-view-transition';

/**
 * Applies view-transition-name CSS property to elements with data-view-transition attribute.
 *
 * @example
 * ```html
 * <div data-view-transition="hero-image-hello-world">...</div>
 * ```
 */
export function applyViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	elements.forEach((el) => {
		const name = el.getAttribute(VIEW_TRANSITION_ATTR);
		if (name) {
			(el as HTMLElement).style.viewTransitionName = name;
		}
	});
}

/**
 * Clears view-transition-name CSS property from all elements.
 */
export function clearViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	elements.forEach((el) => {
		(el as HTMLElement).style.viewTransitionName = '';
	});
}
