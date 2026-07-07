/**
 * Head morphing utilities for client-side navigation.
 * Intelligently syncs head elements between pages using key-based diffing.
 * @module
 */

import {
	RERUN_SRC_ATTR,
	collectRerunScripts,
	flushPendingRerunScripts,
	isNonExecutableHeadScript,
	isRerunScript,
	shouldPersistExecutableInlineHeadScript,
} from '@ecopages/core/client/navigation-scripts';
import { isReactRouterPageBootstrapAssetSrc } from './hydration-assets.ts';

const PRESERVE_SELECTORS = ['meta[charset]', '[data-eco-persist]'];

export type HeadMorphResult = {
	cleanup: () => void;
	flushRerunScripts: () => void;
};

function isReactRouterPageBootstrapScriptId(scriptId: string | null): boolean {
	return !!scriptId && scriptId.startsWith('ecopages-react-') && !scriptId.startsWith('ecopages-react-island-');
}

function isHydrationScript(el: HTMLScriptElement): boolean {
	const src = el.getAttribute('src');
	const scriptId = el.getAttribute('data-eco-script-id');
	return isReactRouterPageBootstrapScriptId(scriptId) || (!!src && isReactRouterPageBootstrapAssetSrc(src));
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
 *
 * @remarks
 * Returns cleanup and rerun hooks separately so callers can defer head removal
 * until after a view-transition snapshot captures the old styles.
 */
export async function morphHead(newDocument: Document): Promise<HeadMorphResult> {
	const currentHead = document.head;
	const newHead = newDocument.head;

	const currentElements = new Map<string, Element>();
	const newElements = new Map<string, Element>();
	const stylesheetPromises: Promise<void>[] = [];
	const elementsToRemove: Element[] = [];
	const pendingRerunScripts = collectRerunScripts(newDocument, (script) => !isHydrationScript(script));

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

		if (isRerunScript(newEl)) {
			continue;
		}

		if (!currentEl) {
			if (newEl.tagName === 'SCRIPT' && isHydrationScript(newEl as HTMLScriptElement)) {
				continue;
			}

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
		} else if (isNonExecutableHeadScript(newEl) && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		} else if (key.startsWith('style:') && currentEl.textContent !== newEl.textContent) {
			currentEl.textContent = newEl.textContent;
		}
	}

	for (const newEl of Array.from(newHead.children)) {
		const key = getHeadElementKey(newEl);
		if (!key && !isRerunScript(newEl)) {
			currentHead.appendChild(newEl.cloneNode(true));
		}
	}

	if (stylesheetPromises.length > 0) {
		await Promise.all(stylesheetPromises);
	}

	for (const [key, el] of currentElements) {
		if (!newElements.has(key)) {
			const shouldPreserve = PRESERVE_SELECTORS.some((sel) => el.matches(sel));
			if (!shouldPreserve && !shouldPersistExecutableInlineHeadScript(el)) {
				elementsToRemove.push(el);
			}
		}
	}

	return {
		cleanup: () => {
			for (const el of elementsToRemove) {
				el.remove();
			}
		},
		flushRerunScripts: () => {
			flushPendingRerunScripts(pendingRerunScripts);
		},
	};
}
