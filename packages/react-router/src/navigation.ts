/**
 * Navigation utilities for fetching and parsing page content.
 * @module
 */

import { type ComponentType } from 'react';
import type { EcoRouterOptions } from './types.ts';

export type PageState = {
	Component: ComponentType<any>;
	props: Record<string, any>;
};

/**
 * Matches a default import statement and captures the module path.
 * Example: `import Content from './Content'`
 */
const DEFAULT_IMPORT_REGEX = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;

/**
 * Matches a namespace import statement and captures the module path.
 * Example: `import * as Content from './Content'` or `import*as Content from'./Content'` (minified)
 */
const NAMESPACE_IMPORT_REGEX = /import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]/;

/**
 * Extracts the first module path from a default or namespace import in the given code.
 */
function extractModulePathFromCode(code: string): string | null {
	const defaultMatch = code.match(DEFAULT_IMPORT_REGEX);
	const namespaceMatch = code.match(NAMESPACE_IMPORT_REGEX);
	return (defaultMatch || namespaceMatch)?.[2] ?? null;
}

/**
 * Extracts serialized page props from the target document.
 */
export function extractProps(doc: Document): Record<string, any> {
	const propsScript = doc.getElementById('__ECO_PROPS__');
	if (!propsScript?.textContent) return {};

	try {
		return JSON.parse(propsScript.textContent);
	} catch {
		return {};
	}
}

/**
 * Adds cache-busting timestamp for HMR development reloads.
 * Only applies in development to force fresh module imports.
 */
function addCacheBuster(url: string): string {
	if (import.meta.env?.MODE === 'production' || import.meta.env?.PROD) {
		return url;
	}
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}t=${Date.now()}`;
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
		const scriptUrl = addCacheBuster(hydrationScript.src);
		const res = await fetch(scriptUrl);
		const code = await res.text();
		return extractModulePathFromCode(code);
	} catch {
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

		const props = extractProps(doc);
		const componentUrl = await extractComponentUrl(doc);

		if (!componentUrl) {
			console.error('[EcoRouter] Could not find component URL');
			return null;
		}

		const moduleUrl = addCacheBuster(componentUrl);
		const module = await import(moduleUrl);
		const rawComponent = module.Content || module.default?.Content || module.default;

		const config = module.config || rawComponent?.config;

		if (!rawComponent) {
			console.error('[EcoRouter] No component found in module');
			return null;
		}

		if (config && !rawComponent.config) {
			rawComponent.config = config;
		}

		return { Component: rawComponent, props, doc };
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
