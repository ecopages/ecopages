/**
 * View Transition API helpers for `data-view-transition` markup and safe root defaults.
 * @module
 */

const VIEW_TRANSITION_ATTR = 'data-view-transition';
const VIEW_TRANSITION_ANIMATE_ATTR = 'data-view-transition-animate';
const VIEW_TRANSITION_DURATION_ATTR = 'data-view-transition-duration';
const DYNAMIC_STYLES_ID = 'eco-vt-dynamic-styles';
const ROOT_STYLES_ID = 'eco-vt-root-styles';

/**
 * @remarks
 * UA default is `html { view-transition-name: root }`, which snapshots the whole
 * document and crossfades with plus-lighter (flashes lighter on dark UIs). Routers
 * inject this opt-out when `viewTransitions` is enabled. Named `data-view-transition`
 * morphs still run. Full-page fades are not a supported default — use named elements
 * or app-owned motion outside the View Transitions API.
 */
const ROOT_STYLES_CSS = `html {
	view-transition-name: none;
}
`;

/**
 * Whether a document tree contains elements that participate in named view transitions.
 */
export function documentHasNamedViewTransitions(doc: Document): boolean {
	return doc.querySelector(`[${VIEW_TRANSITION_ATTR}]`) !== null;
}

/**
 * Whether SPA navigation should use `startViewTransition` (old or incoming page).
 */
export function navigationHasNamedViewTransitions(current: Document, incoming: Document): boolean {
	return documentHasNamedViewTransitions(current) || documentHasNamedViewTransitions(incoming);
}

/**
 * Injects persisted CSS that opts the document out of the root view-transition group.
 *
 * @remarks
 * Uses `data-eco-persist` so head morphing does not drop the stylesheet between navigations.
 * Named `data-view-transition` morph / fade rules live in a separate dynamic style tag.
 */
export function ensureRootViewTransitionStyles(): void {
	let styleEl = document.getElementById(ROOT_STYLES_ID);
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = ROOT_STYLES_ID;
		styleEl.setAttribute('data-eco-persist', '');
		document.head.append(styleEl);
	}

	if (styleEl.textContent !== ROOT_STYLES_CSS) {
		styleEl.textContent = ROOT_STYLES_CSS;
	}
}

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
