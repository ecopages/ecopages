/**
 * Shared document navigation lifecycle events for browser runtimes.
 *
 * @remarks
 * `eco:before-swap`, `eco:after-swap`, and `eco:page-load` are the public
 * contract consumed by dev tooling, global injectors, and layout scripts.
 * Dispatch helpers live here so browser-router and react-router stay aligned.
 *
 * @module
 */

import type { EcoNavigationDirection } from './navigation-coordinator.ts';

export const ECO_NAVIGATION_LIFECYCLE_EVENTS = {
	BEFORE_SWAP: 'eco:before-swap',
	AFTER_SWAP: 'eco:after-swap',
	PAGE_LOAD: 'eco:page-load',
} as const;

/** Base detail shared by navigation lifecycle events. */
export interface EcoNavigationEvent {
	url: URL;
	direction: EcoNavigationDirection;
}

/** Detail for the pre-commit lifecycle event. */
export interface EcoBeforeSwapEvent extends EcoNavigationEvent {
	newDocument: Document;
	reload: () => void;
}

/** Detail for the post-commit lifecycle event. */
export interface EcoAfterSwapEvent extends EcoNavigationEvent {}

/** Typed document event map for navigation lifecycle listeners. */
export interface EcoNavigationLifecycleEventMap {
	'eco:before-swap': CustomEvent<EcoBeforeSwapEvent>;
	'eco:after-swap': CustomEvent<EcoAfterSwapEvent>;
	'eco:page-load': CustomEvent<EcoNavigationEvent>;
}

export type DispatchBeforeSwapResult = {
	requestedReload: boolean;
};

export type SchedulePageLoadOptions = {
	isStale?: () => boolean;
	schedule?: (callback: FrameRequestCallback) => number;
};

/**
 * Dispatches `eco:before-swap` and reports whether a listener requested reload.
 */
export function dispatchBeforeSwap(doc: Document, input: Omit<EcoBeforeSwapEvent, 'reload'>): DispatchBeforeSwapResult {
	let requestedReload = false;
	const detail: EcoBeforeSwapEvent = {
		...input,
		reload: () => {
			requestedReload = true;
		},
	};

	doc.dispatchEvent(new CustomEvent(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, { detail }));
	return { requestedReload };
}

/** Dispatches `eco:after-swap`. */
export function dispatchAfterSwap(doc: Document, detail: EcoAfterSwapEvent): void {
	doc.dispatchEvent(new CustomEvent(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, { detail }));
}

/**
 * Schedules `eco:page-load` on the next animation frame unless navigation is stale.
 */
export function schedulePageLoad(
	doc: Document,
	detail: EcoNavigationEvent,
	options: SchedulePageLoadOptions = {},
): void {
	const schedule = options.schedule ?? ((callback: FrameRequestCallback) => requestAnimationFrame(callback));

	schedule(() => {
		if (options.isStale?.()) {
			return;
		}

		doc.dispatchEvent(new CustomEvent(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, { detail }));
	});
}
