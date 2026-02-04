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

export type InterceptDecision =
	| { shouldIntercept: true }
	| {
			shouldIntercept: false;
			reason:
				| 'modified-click'
				| 'non-left-click'
				| 'external-target'
				| 'explicit-reload'
				| 'download'
				| 'invalid-href'
				| 'cross-origin';
	  };

/**
 * Determines whether a link click should be intercepted for client-side navigation.
 *
 * Standard SPA navigation rules:
 * - Modified clicks (Cmd/Ctrl/Shift/Alt) open in new tab
 * - Non-left clicks use default browser behavior
 * - External targets, downloads, and cross-origin links navigate normally
 *
 * @returns Object indicating whether to intercept and the reason if not
 */
export function getInterceptDecision(
	event: MouseEvent,
	link: HTMLAnchorElement,
	options: Required<EcoRouterOptions>,
): InterceptDecision {
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
		return { shouldIntercept: false, reason: 'modified-click' };
	}
	if (event.button !== 0) return { shouldIntercept: false, reason: 'non-left-click' };

	const target = link.getAttribute('target');
	if (target && target !== '_self') return { shouldIntercept: false, reason: 'external-target' };

	if (link.hasAttribute(options.reloadAttribute)) return { shouldIntercept: false, reason: 'explicit-reload' };
	if (link.hasAttribute('download')) return { shouldIntercept: false, reason: 'download' };

	const href = link.getAttribute('href');
	if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
		return { shouldIntercept: false, reason: 'invalid-href' };
	}

	const url = new URL(href, window.location.origin);
	if (url.origin !== window.location.origin) return { shouldIntercept: false, reason: 'cross-origin' };

	return { shouldIntercept: true };
}

/**
 * Extracts component module URL from __ECO_PAGE_MODULE__ JSON script tag.
 *
 * This is the primary method to discover the component's import path during
 * client-side navigation. Module paths vary between dev and prod environments.
 *
 * NOTE: Will be replaced with window.__ECO_PAGE__ pattern
 */
function extractComponentUrlFromMarker(doc: Document): string | null {
	const marker = doc.getElementById('__ECO_PAGE_MODULE__');
	if (!marker?.textContent) return null;

	try {
		const value = JSON.parse(marker.textContent);
		return typeof value === 'string' && value ? value : null;
	} catch {
		return null;
	}
}

/**
 * Matches default import: `import Content from './Content'`
 * Fallback for when __ECO_PAGE_MODULE__ marker is missing.
 */
const DEFAULT_IMPORT_REGEX = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;

/**
 * Matches namespace import: `import * as Content from './Content'`
 * Used for MDX components. Also handles minified: `import*as Content from'./Content'`
 */
const NAMESPACE_IMPORT_REGEX = /import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]/;

/**
 * Extracts import path from hydration script code using regex.
 * Fallback when marker is unavailable. Less reliable due to minification.
 */
function extractModulePathFromCode(code: string): string | null {
	const defaultMatch = code.match(DEFAULT_IMPORT_REGEX);
	const namespaceMatch = code.match(NAMESPACE_IMPORT_REGEX);
	return (defaultMatch || namespaceMatch)?.[2] ?? null;
}

/**
 * Extracts serialized page props from __ECO_PROPS__ JSON script tag.
 *
 * Props from getStaticProps or runtime data are needed to hydrate the new
 * page component during client-side navigation.
 *
 * NOTE: Will be consolidated into window.__ECO_PAGE__
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
 * Adds cache-busting timestamp for HMR in development.
 *
 * Prevents loading stale cached modules when navigating to previously visited pages.
 * Disabled in production where filenames have content hashes.
 */
function addCacheBuster(url: string): string {
	if (import.meta.env?.MODE === 'production' || import.meta.env?.PROD) {
		return url;
	}
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}t=${Date.now()}`;
}

/**
 * Extracts component module URL using multi-tier fallback strategy.
 *
 * 1. Read from __ECO_PAGE_MODULE__ marker (primary)
 * 2. Parse inline hydration script with regex (fallback)
 * 3. Fetch and parse external hydration script (final fallback)
 *
 * Fallbacks provide resilience and backward compatibility but are less reliable
 * due to minification. Will be simplified with window.__ECO_PAGE__ pattern.
 */
export async function extractComponentUrl(doc: Document): Promise<string | null> {
	const markerUrl = extractComponentUrlFromMarker(doc);
	if (markerUrl) return markerUrl;

	const scripts = Array.from(doc.querySelectorAll('script'));

	const inlineHydrationScript = scripts.find(
		(s) =>
			!s.src &&
			!!s.textContent &&
			s.textContent.includes('__ECO_PROPS__') &&
			s.textContent.includes('hydrateRoot') &&
			s.textContent.includes('import'),
	);

	if (inlineHydrationScript?.textContent) {
		return extractModulePathFromCode(inlineHydrationScript.textContent);
	}

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
 * Fetches and parses a page, returning its component, props, and document.
 *
 * Flow: Fetch HTML → Parse → Extract props → Extract component URL → Import module
 *
 * Handles multiple export patterns (Content, default.Content, default) for different
 * integration setups. Does NOT update DOM - caller applies changes.
 *
 * @returns Object with Component, props, doc, and finalPath, or null on error
 */
export async function loadPageModule(
	url: string,
): Promise<{ Component: ComponentType<any>; props: Record<string, any>; doc: Document; finalPath: string } | null> {
	try {
		const res = await fetch(url);
		const html = await res.text();

		const finalUrl = new URL(res.url || url, window.location.origin);
		const finalPath = finalUrl.pathname + finalUrl.search;

		const doc = new DOMParser().parseFromString(html, 'text/html');

		const props = extractProps(doc);
		const componentUrl = await extractComponentUrl(doc);

		if (!componentUrl) {
			console.error('[EcoRouter] Could not find component URL');
			return null;
		}

		const moduleUrl = addCacheBuster(componentUrl);
		const module = await import(/* @vite-ignore */ moduleUrl);
		const rawComponent = module.Content || module.default?.Content || module.default;

		const config = module.config || rawComponent?.config;

		if (!rawComponent) {
			console.error('[EcoRouter] No component found in module');
			return null;
		}

		if (config && !rawComponent.config) {
			rawComponent.config = config;
		}

		return { Component: rawComponent, props, doc, finalPath };
	} catch (e) {
		console.error('[EcoRouter] Navigation failed:', e);
		return null;
	}
}

/**
 * Convenience wrapper around getInterceptDecision that returns a boolean.
 * Use getInterceptDecision directly when you need the reason for debugging.
 */
export function shouldInterceptClick(
	event: MouseEvent,
	link: HTMLAnchorElement,
	options: Required<EcoRouterOptions>,
): boolean {
	return getInterceptDecision(event, link, options).shouldIntercept;
}
