/**
 * Navigation utilities for fetching and parsing page content.
 * @module
 */

import type { ComponentType } from 'react';
import type { EcoRouterOptions } from './types';

export type PageState = {
	Component: ComponentType<any>;
	props: Record<string, any>;
};

/**
 * Extracts serialized page props from the target document.
 */
export function extractProps(doc: Document): Record<string, any> {
	const propsScript = doc.getElementById('__ECO_PROPS__');
	if (!propsScript?.textContent) return {};

	try {
		return JSON.parse(propsScript.textContent);
	} catch {
		console.error('[EcoRouter] Failed to parse props');
		return {};
	}
}

/**
 * Extracts the component module URL from the hydration script.
 * Supports both default imports and namespace imports (MDX).
 */
export async function extractComponentUrl(doc: Document): Promise<string | null> {
	const scripts = Array.from(doc.querySelectorAll('script'));
	const hydrationScript = scripts.find((s) => s.src?.includes('hydration.js') && s.src?.includes('ecopages-react'));

	if (!hydrationScript?.src) return null;

	try {
		const res = await fetch(hydrationScript.src);
		const text = await res.text();

		/**
		 * Matches:
		 * import Content from './Content';
		 */
		const defaultImport = text.match(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);

		/**
		 * Matches:
		 * import * as Content from './Content';
		 */
		const namespaceImport = text.match(/import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);

		return (defaultImport || namespaceImport)?.[2] ?? null;
	} catch {
		console.error('[EcoRouter] Failed to fetch hydration script');
		return null;
	}
}

/**
 * Fetches and parses a page, returning its component, props, and parsed document.
 * Does NOT apply side effects (like updating <head>).
 * @returns Object containing the Component, props, and parsed Document.
 */
export async function loadPageModule(
	url: string,
): Promise<{ Component: ComponentType<any>; props: Record<string, any>; doc: Document } | null> {
	try {
		const res = await fetch(url);
		const html = await res.text();

		const doc = new DOMParser().parseFromString(html, 'text/html');

		// Note: We don't call morphHead(doc) here anymore.
		// It must be called by the router inside the view transition callback.

		const props = extractProps(doc);
		const componentUrl = await extractComponentUrl(doc);

		if (!componentUrl) {
			console.error('[EcoRouter] Could not find component URL');
			return null;
		}

		const module = await import(componentUrl);
		const Component = module.Content || module.default?.Content || module.default;

		return { Component, props, doc };
	} catch (e) {
		console.error('[EcoRouter] Navigation failed:', e);
		return null;
	}
}

/**
 * Determines whether a click event on a link should be intercepted.
 */
export function shouldInterceptClick(
	event: MouseEvent,
	link: HTMLAnchorElement,
	options: Required<EcoRouterOptions>,
): boolean {
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
	if (event.button !== 0) return false;

	const target = link.getAttribute('target');
	if (target && target !== '_self') return false;

	if (link.hasAttribute(options.reloadAttribute)) return false;
	if (link.hasAttribute('download')) return false;

	const href = link.getAttribute('href');
	if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

	const url = new URL(href, window.location.origin);
	return url.origin === window.location.origin;
}
