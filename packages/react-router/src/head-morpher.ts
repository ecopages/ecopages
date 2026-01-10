/**
 * Head morphing utilities for client-side navigation.
 * Intelligently syncs head elements between pages using key-based diffing.
 * @module
 */

const PRESERVE_SELECTORS = ['script[type="importmap"]', 'meta[charset]', '[data-eco-persist]'];

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

		case 'style': {
			const dataId = el.getAttribute('data-eco-style');
			if (dataId) return `style:${dataId}`;
			const content = el.textContent || '';
			return `style:${hashString(content)}`;
		}

		default:
			return null;
	}
}

function hashString(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return hash.toString(36);
}

/**
 * Morphs the current document head to match the new document's head.
 * Now splits the process into adding new elements and returning a cleanup function
 * to remove old ones. This is crucial for View Transitions to ensure styles
 * don't disappear before the "old" snapshot is taken.
 *
 * @param newDocument - The parsed document from the navigation target
 * @returns Promise that resolves to a cleanup function when new stylesheets have loaded
 */
export async function morphHead(newDocument: Document): Promise<() => void> {
	const currentHead = document.head;
	const newHead = newDocument.head;

	const currentElements = new Map<string, Element>();
	const newElements = new Map<string, Element>();
	const stylesheetPromises: Promise<void>[] = [];
	const elementsToRemove: Element[] = [];

	for (const el of Array.from(currentHead.children)) {
		const key = getHeadElementKey(el);
		if (key) currentElements.set(key, el);
	}

	for (const el of Array.from(newHead.children)) {
		const key = getHeadElementKey(el);
		if (key) newElements.set(key, el);
	}

	for (const [key, newEl] of newElements) {
		const currentEl = currentElements.get(key);

		if (!currentEl) {
			const cloned = newEl.cloneNode(true) as Element;

			if (cloned.tagName === 'LINK' && (cloned as HTMLLinkElement).rel === 'stylesheet') {
				const loadPromise = new Promise<void>((resolve) => {
					(cloned as HTMLLinkElement).onload = () => resolve();
					(cloned as HTMLLinkElement).onerror = () => resolve();
				});
				stylesheetPromises.push(loadPromise);
			}

			currentHead.appendChild(cloned);
		} else if (key === 'title' && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		} else if (key.startsWith('style:') && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		}
	}

	for (const newEl of Array.from(newHead.children)) {
		const key = getHeadElementKey(newEl);
		if (!key) {
			currentHead.appendChild(newEl.cloneNode(true));
		}
	}

	if (stylesheetPromises.length > 0) {
		await Promise.all(stylesheetPromises);
	}

	for (const [key, el] of currentElements) {
		if (!newElements.has(key)) {
			const shouldPreserve = PRESERVE_SELECTORS.some((sel) => el.matches(sel));
			if (!shouldPreserve) {
				elementsToRemove.push(el);
			}
		}
	}

	return () => {
		for (const el of elementsToRemove) {
			el.remove();
		}
	};
}
