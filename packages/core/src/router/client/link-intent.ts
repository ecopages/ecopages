/**
 * Shared client-side navigation intent helpers.
 *
 * Browser runtimes use the same low-level mechanics to:
 * - locate the anchor associated with a click, pointer, or hover event,
 * - persist the last valid pointer or hover target while a navigation is in flight,
 * - recover the final intended href when the DOM changes before the click lands.
 *
 * Keeping those mechanics here lets browser-router and react-router share one
 * implementation while preserving their router-specific interception rules.
 *
 * @module
 */

/**
 * Timestamped navigation intent captured from pointer or hover activity.
 */
export type EcoPendingNavigationIntent = {
	href: string;
	timestamp: number;
};

/**
 * Finds the nearest matching anchor within an event's composed path.
 *
 * This works across Shadow DOM boundaries, which is required for delegated
 * navigation handling when links are rendered inside custom elements.
 *
 * @param event - Pointer or mouse event being inspected.
 * @param linkSelector - Selector that identifies navigable anchors.
 * @returns The matched anchor element, or `null` when no matching anchor exists.
 */
export function getAnchorFromNavigationEvent(
	event: MouseEvent | PointerEvent,
	linkSelector: string,
): HTMLAnchorElement | null {
	return event
		.composedPath()
		.find(
			(target) => target instanceof HTMLAnchorElement && target.matches(linkSelector),
		) as HTMLAnchorElement | null;
}

/**
 * Resolves a previously captured intent while a navigation is still in flight.
 *
 * Pending intents expire quickly because they are only meant to bridge the gap
 * between pointer or hover capture and the later click event when the DOM or
 * active runtime changes during a rapid navigation sequence.
 *
 * @param intent - Previously captured pointer or hover intent.
 * @param hasInFlightNavigation - Whether a router navigation is still active.
 * @param now - Current monotonic timestamp, usually from `performance.now()`.
 * @param maxAgeMs - Maximum allowed age for the recovered intent.
 * @returns The intended href when still valid, otherwise `null`.
 */
export function recoverPendingNavigationHref(
	intent: EcoPendingNavigationIntent | null,
	hasInFlightNavigation: boolean,
	now: number,
	maxAgeMs = 1000,
): string | null {
	if (!intent || !hasInFlightNavigation) {
		return null;
	}

	if (now - intent.timestamp > maxAgeMs) {
		return null;
	}

	return intent.href;
}
