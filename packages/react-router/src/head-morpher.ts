/**
 * Head morphing utilities for client-side navigation.
 * Intelligently syncs head elements between pages using key-based diffing.
 * @module
 */

const PRESERVE_SELECTORS = ['script[type="importmap"]', 'meta[charset]'];

/**
 * Computes a unique key for a head element to enable diffing.
 * Elements with the same key are considered the same across navigations.
 */
function getHeadElementKey(el: Element): string | null {
	const tag = el.tagName.toLowerCase();

	switch (tag) {
		case 'title':
			return 'title';

		case 'meta': {
			const name = el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('http-equiv');
			return name ? `meta:${name}` : null;
		}

		case 'link': {
			const rel = el.getAttribute('rel');
			const href = el.getAttribute('href');
			if (rel === 'stylesheet' && href) return `stylesheet:${href}`;
			if (rel === 'icon' || rel === 'shortcut icon') return 'favicon';
			if (rel === 'canonical') return 'canonical';
			return href ? `link:${href}` : null;
		}

		case 'script': {
			if (el.getAttribute('type') === 'importmap') return 'importmap';
			const src = (el as HTMLScriptElement).src;
			return src ? `script:${src}` : null;
		}

		default:
			return null;
	}
}

/**
 * Morphs the current document head to match the new document's head.
 * Uses key-based matching to avoid unnecessary re-downloads of stylesheets
 * and re-execution of scripts.
 *
 * @param newDocument - The parsed document from the navigation target
 */
export function morphHead(newDocument: Document): void {
	const currentHead = document.head;
	const newHead = newDocument.head;

	const currentElements = new Map<string, Element>();
	const newElements = new Map<string, Element>();

	for (const el of Array.from(currentHead.children)) {
		const key = getHeadElementKey(el);
		if (key) currentElements.set(key, el);
	}

	for (const el of Array.from(newHead.children)) {
		const key = getHeadElementKey(el);
		if (key) newElements.set(key, el);
	}

	for (const [key, el] of currentElements) {
		if (!newElements.has(key)) {
			const shouldPreserve = PRESERVE_SELECTORS.some((sel) => el.matches(sel));
			if (!shouldPreserve) {
				el.remove();
			}
		}
	}

	for (const [key, newEl] of newElements) {
		const currentEl = currentElements.get(key);

		if (!currentEl) {
			currentHead.appendChild(newEl.cloneNode(true));
		} else if (key === 'title' && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		}
	}

	for (const newEl of Array.from(newHead.children)) {
		const key = getHeadElementKey(newEl);
		if (!key) {
			currentHead.appendChild(newEl.cloneNode(true));
		}
	}
}
