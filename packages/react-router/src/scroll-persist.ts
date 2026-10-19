/**
 * Scroll position persistence for elements marked with `data-eco-persist="scroll"`.
 *
 * Handles two navigation scenarios:
 * - **Forward navigation**: Preserves current scroll positions for shared layout elements
 * - **Back navigation**: Restores positions from when the page was last visited
 *
 * @module scroll-persist
 */

import { ECO_PERSIST_ATTRIBUTE } from '@ecopages/core/client';

const PERSIST_SELECTOR = `[${ECO_PERSIST_ATTRIBUTE}="scroll"]`;

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
 *
 * @param leavingUrl - Path, search and hash of the page being left
 * @remarks
 * The key is passed in because `window.location` already points at the destination during a
 * back/forward navigation. Reading it here would store the leaving page's scroll under the
 * destination's key and then restore it.
 */
export function saveScrollPositions(leavingUrl: string): void {
	const positions = captureScrollPositions();

	if (positions.size > 0) {
		urlScrollStore.set(leavingUrl, positions);
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

	const restore = (remainingAttempts: number) => {
		requestAnimationFrame(() => {
			const restoredKeys = new Set<string>();

			document.querySelectorAll(PERSIST_SELECTOR).forEach((el) => {
				const key = getElementKey(el);
				if (!key || !positions.has(key)) {
					return;
				}

				const pos = positions.get(key)!;
				el.scrollTop = pos.top;
				el.scrollLeft = pos.left;
				restoredKeys.add(key);
			});

			if (restoredKeys.size === positions.size || remainingAttempts <= 1) {
				currentScrollSnapshot = null;
				return;
			}

			setTimeout(() => restore(remainingAttempts - 1), 50);
		});
	};

	restore(20);
}
