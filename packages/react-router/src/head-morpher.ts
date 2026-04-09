/**
 * Head morphing utilities for client-side navigation.
 * Intelligently syncs head elements between pages using key-based diffing.
 * @module
 */

const PRESERVE_SELECTORS = ['script[type="importmap"]', 'meta[charset]', '[data-eco-persist]'];
const RERUN_SRC_ATTR = 'data-eco-rerun-src';

type PendingRerunScript = {
	attributes: Array<[string, string]>;
	textContent: string;
	scriptId: string | null;
	src: string | null;
};

export type HeadMorphResult = {
	cleanup: () => void;
	flushRerunScripts: () => void;
};

let rerunNonce = 0;

function isNonExecutableHeadScript(el: Element): boolean {
	if (el.tagName !== 'SCRIPT') {
		return false;
	}

	const type = (el.getAttribute('type') ?? '').trim().toLowerCase();
	if (!type) {
		return false;
	}

	return ![
		'application/javascript',
		'application/ecmascript',
		'module',
		'text/ecmascript',
		'text/javascript',
	].includes(type);
}

function shouldPersistExecutableInlineHeadScript(el: Element): boolean {
	if (el.tagName !== 'SCRIPT') {
		return false;
	}

	const scriptId = el.getAttribute('data-eco-script-id') || el.getAttribute('id');
	if (!scriptId) {
		return false;
	}

	if (el.hasAttribute('data-eco-rerun')) {
		return false;
	}

	if ((el as HTMLScriptElement).src) {
		return false;
	}

	return !isNonExecutableHeadScript(el);
}

function isRerunScript(el: Element): el is HTMLScriptElement {
	return el.tagName === 'SCRIPT' && el.hasAttribute('data-eco-rerun');
}

function isHydrationScript(el: HTMLScriptElement): boolean {
	const src = el.getAttribute('src');
	return !!src && src.includes('hydration.js') && src.includes('ecopages-react');
}

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
			const scriptId = el.getAttribute('data-eco-script-id') || el.getAttribute('id');
			if (scriptId) return `script-id:${scriptId}`;
			const src = el.getAttribute(RERUN_SRC_ATTR) || (el as HTMLScriptElement).src;
			return src ? `script:${src}` : null;
		}

		case 'style': {
			const dataId = el.getAttribute('data-eco-style');
			return dataId ? `style:${dataId}` : null;
		}

		default:
			return null;
	}
}

/**
 * Morphs the current document head to match the new document's head.
 * Now splits the process into adding new elements and returning a cleanup function
 * to remove old ones. This is crucial for View Transitions to ensure styles
 * don't disappear before the "old" snapshot is taken.
 *
 * @param newDocument - The parsed document from the navigation target
 * @returns Promise that resolves to cleanup and rerun hooks when new stylesheets have loaded
 */
export async function morphHead(newDocument: Document): Promise<HeadMorphResult> {
	const currentHead = document.head;
	const newHead = newDocument.head;

	const currentElements = new Map<string, Element>();
	const newElements = new Map<string, Element>();
	const stylesheetPromises: Promise<void>[] = [];
	const elementsToRemove: Element[] = [];
	const pendingRerunScripts = Array.from(newHead.querySelectorAll<HTMLScriptElement>('script[data-eco-rerun]'))
		.filter((script) => !isHydrationScript(script))
		.map((script) => ({
			attributes: Array.from(script.attributes).map((attr) => [attr.name, attr.value] as [string, string]),
			textContent: script.textContent ?? '',
			scriptId: script.getAttribute('data-eco-script-id'),
			src: script.getAttribute('src'),
		}));

	/**
	 * First, map existing head elements by their keys
	 * to enable efficient diffing.
	 */
	for (const el of Array.from(currentHead.children)) {
		const key = getHeadElementKey(el);
		if (key) currentElements.set(key, el);
	}

	/**
	 * Next, map new head elements by their keys.
	 * This allows us to see which elements are new, updated, or removed.
	 */
	for (const el of Array.from(newHead.children)) {
		const key = getHeadElementKey(el);
		if (key) newElements.set(key, el);
	}

	/**
	 * Now, iterate over new elements to add or update them in the current head.
	 */
	for (const [key, newEl] of newElements) {
		const currentEl = currentElements.get(key);

		if (isRerunScript(newEl)) {
			continue;
		}

		if (!currentEl) {
			/**
			 * Skip hydration scripts during SPA navigation to prevent re-mounting.
			 * The EcoRouter is already running and handles page updates internally.
			 */
			if (newEl.tagName === 'SCRIPT' && isHydrationScript(newEl as HTMLScriptElement)) {
				continue;
			}

			const cloned = newEl.cloneNode(true) as Element;

			/**
			 * If the new element is a stylesheet, we need to wait for it to load
			 * before considering the head morph complete. This prevents FOUC.
			 */
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
		} else if (isNonExecutableHeadScript(newEl) && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		} else if (key.startsWith('style:') && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		}
	}

	/**
	 * Finally, handle any new elements without keys (e.g., inline scripts/styles)
	 */
	for (const newEl of Array.from(newHead.children)) {
		const key = getHeadElementKey(newEl);
		if (!key && !isRerunScript(newEl)) {
			currentHead.appendChild(newEl.cloneNode(true));
		}
	}

	/**
	 * Wait for all new stylesheets to load before proceeding.
	 */
	if (stylesheetPromises.length > 0) {
		await Promise.all(stylesheetPromises);
	}

	/**
	 * Identify and prepare to remove any old elements
	 * that are no longer present in the new head.
	 */
	for (const [key, el] of currentElements) {
		if (!newElements.has(key)) {
			const shouldPreserve = PRESERVE_SELECTORS.some((sel) => el.matches(sel));
			if (!shouldPreserve && !shouldPersistExecutableInlineHeadScript(el)) {
				elementsToRemove.push(el);
			}
		}
	}

	/**
	 * Return a cleanup function to remove old elements.
	 * This allows the caller to control when the removal happens,
	 * which is important for View Transitions.
	 */
	return {
		cleanup: () => {
			for (const el of elementsToRemove) {
				el.remove();
			}
		},
		flushRerunScripts: () => {
			for (const script of pendingRerunScripts) {
				const replacement = document.createElement('script');
				const shouldBustModuleSrc = isExternalModuleRerunScript(script);

				for (const [name, value] of script.attributes) {
					if (name === 'src' && shouldBustModuleSrc) {
						replacement.setAttribute(RERUN_SRC_ATTR, value);
						replacement.setAttribute('src', createRerunScriptUrl(value));
						continue;
					}

					replacement.setAttribute(name, value);
				}

				replacement.textContent = script.textContent;

				const existingScript = findExistingRerunScript(script);
				if (existingScript) {
					existingScript.replaceWith(replacement);
					continue;
				}

				document.head.appendChild(replacement);
			}
		},
	};
}

function findExistingRerunScript(script: PendingRerunScript): HTMLScriptElement | null {
	const scripts = Array.from(document.head.querySelectorAll<HTMLScriptElement>('script'));

	if (script.scriptId) {
		return scripts.find((candidate) => candidate.getAttribute('data-eco-script-id') === script.scriptId) ?? null;
	}

	return (
		scripts.find(
			(candidate) =>
				(candidate.getAttribute(RERUN_SRC_ATTR) ?? candidate.getAttribute('src')) === script.src &&
				(candidate.textContent ?? '') === script.textContent,
		) ?? null
	);
}

function isExternalModuleRerunScript(script: PendingRerunScript): boolean {
	if (!script.src) {
		return false;
	}

	return script.attributes.some(([name, value]) => name === 'type' && value === 'module');
}

function createRerunScriptUrl(src: string): string {
	const url = new URL(src, document.baseURI);
	url.searchParams.set('__eco_rerun', String(++rerunNonce));
	return url.toString();
}
