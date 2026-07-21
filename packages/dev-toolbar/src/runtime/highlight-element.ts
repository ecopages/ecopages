const HIGHLIGHT_CLASS = 'eco-dev-toolbar__dom-highlight';

export type DevToolbarHighlightTone = 'a11y' | 'island';

const HIGHLIGHT_OUTLINE: Record<DevToolbarHighlightTone, string> = {
	a11y: '2px solid #ff5c7a',
	island: '2px solid #7c5cff',
};

function focusElement(element: HTMLElement): { addedTabIndex: boolean } {
	if (element.matches('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])')) {
		element.focus({ preventScroll: true });
		return { addedTabIndex: false };
	}

	if (!element.hasAttribute('tabindex')) {
		element.setAttribute('tabindex', '-1');
		element.focus({ preventScroll: true });
		return { addedTabIndex: true };
	}

	element.focus({ preventScroll: true });
	return { addedTabIndex: false };
}

export function highlightElement(element: HTMLElement, tone: DevToolbarHighlightTone = 'a11y'): () => void {
	const previousOutline = element.style.outline;
	const previousOutlineOffset = element.style.outlineOffset;
	const { addedTabIndex } = focusElement(element);

	element.classList.add(HIGHLIGHT_CLASS);
	element.dataset.ecoDevToolbarHighlight = tone;
	element.style.outline = HIGHLIGHT_OUTLINE[tone];
	element.style.outlineOffset = '2px';
	element.scrollIntoView({ block: 'center', behavior: 'smooth' });

	return () => {
		element.style.outline = previousOutline;
		element.style.outlineOffset = previousOutlineOffset;
		element.classList.remove(HIGHLIGHT_CLASS);
		delete element.dataset.ecoDevToolbarHighlight;
		if (addedTabIndex) {
			element.removeAttribute('tabindex');
		}
	};
}

export function clearElementHighlight(element: Element | null | undefined): void {
	if (!(element instanceof HTMLElement)) {
		return;
	}

	element.style.outline = '';
	element.style.outlineOffset = '';
	element.classList.remove(HIGHLIGHT_CLASS);
	delete element.dataset.ecoDevToolbarHighlight;
}
