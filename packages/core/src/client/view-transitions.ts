/**
 * View Transition API helpers for `data-view-transition` markup.
 * @module
 */

const VIEW_TRANSITION_ATTR = 'data-view-transition';
const VIEW_TRANSITION_ANIMATE_ATTR = 'data-view-transition-animate';
const VIEW_TRANSITION_DURATION_ATTR = 'data-view-transition-duration';
const DYNAMIC_STYLES_ID = 'eco-vt-dynamic-styles';

/**
 * Assigns `view-transition-name` from `data-view-transition` and injects morph styles.
 *
 * @remarks
 * Elements without `data-view-transition-animate="fade"` get a geometric morph:
 * the old snapshot is hidden so cross-fade ghosting does not appear.
 */
export function applyViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	const morphNames: string[] = [];
	const customDurations: { name: string; duration: string }[] = [];

	elements.forEach((el) => {
		const name = el.getAttribute(VIEW_TRANSITION_ATTR);
		if (!name) {
			return;
		}

		(el as HTMLElement).style.viewTransitionName = name;

		const animate = el.getAttribute(VIEW_TRANSITION_ANIMATE_ATTR);
		if (animate !== 'fade') {
			morphNames.push(name);
		}

		const duration = el.getAttribute(VIEW_TRANSITION_DURATION_ATTR);
		if (duration) {
			customDurations.push({ name, duration });
		}
	});

	if (morphNames.length > 0 || customDurations.length > 0) {
		injectDynamicStyles(morphNames, customDurations);
	}
}

/**
 * Clears inline transition names and dynamic morph styles after a transition ends.
 */
export function clearViewTransitionNames(): void {
	const elements = document.querySelectorAll(`[${VIEW_TRANSITION_ATTR}]`);
	elements.forEach((el) => {
		(el as HTMLElement).style.viewTransitionName = '';
	});

	const styleEl = document.getElementById(DYNAMIC_STYLES_ID);
	if (styleEl) {
		styleEl.textContent = '';
	}
}

function injectDynamicStyles(morphNames: string[], customDurations: { name: string; duration: string }[]): void {
	let styleEl = document.getElementById(DYNAMIC_STYLES_ID);
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = DYNAMIC_STYLES_ID;
		/**
		 * @remarks
		 * Head morphing must not drop this tag between navigations.
		 */
		styleEl.setAttribute('data-eco-persist', '');
		document.head.append(styleEl);
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

	styleEl.textContent = `${morphCss}\n${durationCss}`;
}
