/**
 * Scroll position persistence for elements marked with `data-eco-persist="scroll"`.
 *
 * Handles two navigation scenarios:
 * - **Forward navigation**: Preserves current scroll positions for shared layout elements
 * - **Back navigation**: Restores positions from when the page was last visited
 *
 * @module scroll-persist
 */

const PERSIST_SELECTOR = '[data-eco-persist="scroll"]';

type ScrollPosition = { top: number; left: number };
type ScrollMap = Map<string, ScrollPosition>;
type UrlScrollStore = Map<string, ScrollMap>;

const urlScrollStore: UrlScrollStore = new Map();
let currentScrollSnapshot: ScrollMap | null = null;

function getElementKey(el: Element): string | null {
	return el.id || el.getAttribute('data-testid') || null;
}

function captureScrollPositions(): ScrollMap {
	const positions = new Map<string, ScrollPosition>();
	document.querySelectorAll(PERSIST_SELECTOR).forEach((el) => {
		const key = getElementKey(el);
		if (key) {
			positions.set(key, { top: el.scrollTop, left: el.scrollLeft });
		}
	});
	return positions;
}

/**
 * Captures and stores scroll positions before navigation.
 *
 * Saves positions to both:
 * - URL-keyed store (for back navigation restoration)
 * - Current snapshot (for forward navigation preservation)
 */
export function saveScrollPositions(): void {
	const url = window.location.pathname;
	const positions = captureScrollPositions();

	if (positions.size > 0) {
		urlScrollStore.set(url, positions);
	}
	currentScrollSnapshot = positions;
}

/**
 * Restores scroll positions after React render completes.
 *
 * Uses double `requestAnimationFrame` to ensure DOM is fully painted.
 *
 * @param targetUrl - The URL being navigated to
 * @param isPopState - True for back/forward navigation, false for link clicks
 */
export function restoreScrollPositions(targetUrl: string, isPopState: boolean): void {
	const positions = isPopState ? urlScrollStore.get(targetUrl) : currentScrollSnapshot;

	if (!positions || positions.size === 0) {
		currentScrollSnapshot = null;
		return;
	}

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			document.querySelectorAll(PERSIST_SELECTOR).forEach((el) => {
				const key = getElementKey(el);
				if (key && positions.has(key)) {
					const pos = positions.get(key)!;
					el.scrollTop = pos.top;
					el.scrollLeft = pos.left;
				}
			});
			currentScrollSnapshot = null;
		});
	});
}

/**
 * Returns stored scroll positions for a URL without applying them.
 */
export function getScrollPositions(url: string): ScrollMap | undefined {
	return urlScrollStore.get(url);
}

/**
 * Clears all stored scroll positions.
 */
export function clearScrollPositions(): void {
	urlScrollStore.clear();
	currentScrollSnapshot = null;
}
