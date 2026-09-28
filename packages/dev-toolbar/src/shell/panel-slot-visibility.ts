/**
 * Whether a panel element's keep-alive slot is visible (not `hidden`).
 */
export function isPanelSlotVisible(element: Element): boolean {
	const slot = element.closest('.eco-dev-toolbar__panel-slot');
	return slot instanceof HTMLElement && !slot.hidden;
}

/**
 * Invokes `onVisible` when a keep-alive panel slot becomes visible again.
 *
 * @returns Disconnect function for the observer.
 */
export function observePanelSlotVisibility(element: Element, onVisible: () => void): () => void {
	const slot = element.closest('.eco-dev-toolbar__panel-slot');
	if (!(slot instanceof HTMLElement)) {
		return () => {};
	}

	const observer = new MutationObserver(() => {
		if (isPanelSlotVisible(element)) {
			onVisible();
		}
	});
	observer.observe(slot, { attributes: true, attributeFilter: ['hidden'] });

	return () => observer.disconnect();
}
