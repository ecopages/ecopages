/**
 * View transition utilities for applying transition names from data attributes.
 * @module
 */

const VIEW_TRANSITION_ATTR = 'data-view-transition';
const VIEW_TRANSITION_ANIMATE_ATTR = 'data-view-transition-animate';
const VIEW_TRANSITION_DURATION_ATTR = 'data-view-transition-duration';

/**
 * Applies view-transition-name CSS property to elements with data-view-transition attribute.
 * By default, it also injects styles to prevent "ghosting" (sets animation: none) for clean morphing,
 * unless data-view-transition-animate="fade" is present.
 */
export function applyViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	const morphNames: string[] = [];
	const customDurations: { name: string; duration: string }[] = [];

	elements.forEach((el) => {
		const name = el.getAttribute(VIEW_TRANSITION_ATTR);
		if (name) {
			(el as HTMLElement).style.viewTransitionName = name;

			/**
			 * By default, we apply a clean geometric morph (no cross-fade/ghosting).
			 * The 'fade' value is reserved for opting out of this behavior.
			 */
			const animate = el.getAttribute(VIEW_TRANSITION_ANIMATE_ATTR);
			if (animate !== 'fade') {
				morphNames.push(name);
			}

			const duration = el.getAttribute(VIEW_TRANSITION_DURATION_ATTR);
			if (duration) {
				customDurations.push({ name, duration });
			}
		}
	});

	if (morphNames.length > 0 || customDurations.length > 0) {
		injectDynamicStyles(morphNames, customDurations);
	}
}

/**
 * Injects dynamic CSS to hide old snapshots and apply custom durations.
 */
function injectDynamicStyles(morphNames: string[], customDurations: { name: string; duration: string }[]) {
	let styleEl = document.getElementById('eco-vt-dynamic-styles');
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = 'eco-vt-dynamic-styles';
		/**
		 * Persistence is required to prevent the head-morpher from removing this style tag during navigation.
		 * @see {@link DomSwapper}
		 */
		styleEl.setAttribute('data-eco-persist', '');
		document.head.appendChild(styleEl);
	}

	const morphCss = morphNames
		.map(
			(name) => `
		::view-transition-old(${name}) { display: none !important; }
		::view-transition-new(${name}) { animation: none !important; opacity: 1 !important; }
	`,
		)
		.join('\n');

	const durationCss = customDurations
		.map(
			({ name, duration }) => `
		::view-transition-group(${name}) { animation-duration: ${duration} !important; }
	`,
		)
		.join('\n');

	styleEl.textContent = morphCss + '\n' + durationCss;
}

/**
 * Clears view-transition-name CSS property from all elements.
 */
export function clearViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	elements.forEach((el) => {
		(el as HTMLElement).style.viewTransitionName = '';
	});

	/**
	 * Cleanup dynamic styles to ensure a clean slate for the next transition.
	 */
	const styleEl = document.getElementById('eco-vt-dynamic-styles');
	if (styleEl) {
		styleEl.textContent = '';
	}
}
