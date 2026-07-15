/**
 * Navigation utilities for fetching and parsing page content.
 * @module
 */

/// <reference types="@ecopages/core/declarations" />

import { getEcoDocumentOwner } from '@ecopages/core/router/navigation-coordinator';
import { isHtmlPageResponse } from '@ecopages/core/router/link-navigation-policy';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { EcoComponentConfig } from '@ecopages/core';
import { resolveEcoPageDataModuleUrl, resolveEcoPageDataProps } from '@ecopages/react/serialize-page-data-script';
import { type ComponentType } from 'react';
import { isReactPageHydrationAssetSrc } from './hydration-assets.ts';

const ROUTER_PROPS_SCRIPT_ID = '__ECO_PAGE_DATA__';
type PageProps = Record<string, unknown>;
type NavigablePageComponent = ComponentType<PageProps> & { config?: EcoComponentConfig };

export type PageState = {
	Component: NavigablePageComponent;
	props: PageProps;
};

export type LoadedPageModule = {
	Component: NavigablePageComponent;
	props: PageProps;
	doc: Document;
	finalPath: string;
	moduleUrl: string;
};

export type FetchedPageDocument = {
	doc: Document;
	finalPath: string;
	html: string;
};

type LoadPageModuleOptions = {
	signal?: AbortSignal;
};

type LoadPageModuleFromDocumentOptions = {
	/**
	 * Explicit page module URL to import instead of extracting one from the
	 * document's hydration assets.
	 *
	 * React Router uses this during HMR-driven reloads so the active hot module
	 * entry wins over any static bootstrap asset references embedded in the HTML.
	 */
	moduleUrlOverride?: string;
};

/**
 * Extracts component module URL from window.__ECO_PAGES__.page.
 * For current document, returns the module path set by hydration script.
 * For fetched documents, parses the hydration script to extract the module path.
 */
function extractComponentUrlFromMarker(doc: Document): string | null {
	if (doc === document && window.__ECO_PAGES__?.page?.module) {
		return window.__ECO_PAGES__.page.module;
	}
	return null;
}

function parsePageDataPayload(doc: Document): unknown {
	const propsScript = doc.getElementById(ROUTER_PROPS_SCRIPT_ID);
	if (!propsScript?.textContent) {
		return undefined;
	}

	try {
		return JSON.parse(propsScript.textContent) as unknown;
	} catch (error) {
		console.error('[EcoRouter] Failed to parse props:', error);
		return undefined;
	}
}

const PAGE_BOOTSTRAP_SELECTOR = 'script[data-eco-page-bootstrap="react-router"]';

/**
 * @deprecated
 * Regex-based hydration script discovery for one compatibility release. Prefer the
 * v1 `__ECO_PAGE_DATA__` envelope (`schemaVersion` + `moduleUrl`). Remove once all
 * producers emit the manifest.
 */
function deprecatedExtractModuleUrlFromHydrationScriptCode(code: string, fallbackUrl?: string): string | null {
	/** Matches default import: `import Content from './Content'` */
	const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;
	/** Matches namespace import: `import * as Content from './Content'` */
	const namespaceImportRegex = /import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]/;
	const pageModuleMarkerRegex = /__ECO_PAGES__\.page\s*=\s*\{\s*module\s*:\s*['"]([^'"]+)['"]/;
	const pageModuleIdentifierRegex = /__ECO_PAGES__\.page\s*=\s*\{\s*module\s*:\s*([A-Za-z_$][\w$]*)\s*,/;

	const markerMatch = code.match(pageModuleMarkerRegex);
	if (markerMatch) {
		return markerMatch[1] ?? null;
	}

	const moduleIdentifier = code.match(pageModuleIdentifierRegex)?.[1];
	if (moduleIdentifier) {
		const assignmentRegex = new RegExp(
			`(?:const|let|var)[^;]*\\b${moduleIdentifier}\\s*=\\s*(?:['"]([^'"]+)['"]|(import\\.meta\\.url))`,
		);
		const assignmentMatch = code.match(assignmentRegex);
		if (assignmentMatch?.[1]) {
			return assignmentMatch[1];
		}

		if (fallbackUrl && assignmentMatch?.[2]) {
			return fallbackUrl;
		}
	}

	if (fallbackUrl && code.includes('module:import.meta.url')) {
		return fallbackUrl;
	}

	const defaultMatch = code.match(defaultImportRegex);
	const namespaceMatch = code.match(namespaceImportRegex);
	return (defaultMatch || namespaceMatch)?.[2] ?? null;
}

/**
 * Extracts serialized page props from window.__ECO_PAGES__.page or fetched document.
 * For current document, returns props set by hydration script.
 * For fetched documents, parses the JSON script tag directly.
 */
export function extractProps(doc: Document): PageProps {
	if (doc === document && window.__ECO_PAGES__?.page?.props) {
		return resolveEcoPageDataProps(window.__ECO_PAGES__.page.props);
	}

	return resolveEcoPageDataProps(parsePageDataPayload(doc));
}

function isReactRouteDocument(doc: Document): boolean {
	return getEcoDocumentOwner(doc) === 'react-router';
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
 * Extracts component module URL using multi-tier strategy.
 *
 * 1. Read the v1 page-data envelope (`schemaVersion` + `moduleUrl`)
 * 2. Read bootstrap/page markers on the current document
 * 3. Fall back to {@link deprecatedExtractModuleUrlFromHydrationScriptCode} for one release
 *
 * @remarks
 * EcoRouter transition-state extraction remains a separate follow-up. This
 * module only owns document → module/props discovery for React navigation.
 */
export async function extractComponentUrl(doc: Document): Promise<string | null> {
	const manifestUrl = resolveEcoPageDataModuleUrl(parsePageDataPayload(doc));
	if (manifestUrl) return manifestUrl;

	const markerUrl = extractComponentUrlFromMarker(doc);
	if (markerUrl) return markerUrl;

	const scripts = Array.from(doc.querySelectorAll('script'));

	const inlineHydrationScript = scripts.find(
		(s) =>
			!s.src &&
			!!s.textContent &&
			s.textContent.includes('__ECO_PAGES__') &&
			s.textContent.includes('hydrateRoot') &&
			s.textContent.includes('import'),
	);

	if (inlineHydrationScript?.textContent) {
		return deprecatedExtractModuleUrlFromHydrationScriptCode(inlineHydrationScript.textContent);
	}

	const hydrationScript =
		doc.querySelector<HTMLScriptElement>(PAGE_BOOTSTRAP_SELECTOR) ??
		scripts.find((s) => isReactPageHydrationAssetSrc(s.src ?? ''));
	if (!hydrationScript?.src) return null;

	try {
		const scriptUrl = addCacheBuster(hydrationScript.src);
		const res = await fetch(scriptUrl);
		const code = await res.text();
		return deprecatedExtractModuleUrlFromHydrationScriptCode(code, hydrationScript.src);
	} catch {
		return null;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return (typeof value === 'object' && value !== null) || typeof value === 'function'
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * Adapts supported module export shapes to the router's page-component contract.
 *
 * @remarks
 * Config attachment is isolated here because imported component functions may
 * need module-level layout metadata copied onto them before normalization.
 */
function adaptPageModule(moduleNamespace: unknown): NavigablePageComponent | null {
	const module = asRecord(moduleNamespace);
	if (!module) {
		return null;
	}

	const defaultExport = module.default;
	const defaultRecord = asRecord(defaultExport);
	const rawComponent = module.Content ?? defaultRecord?.Content ?? defaultExport;
	if (typeof rawComponent !== 'function') {
		return null;
	}

	const Component = rawComponent as NavigablePageComponent;
	const config = (module.config ?? defaultRecord?.config ?? Component.config) as EcoComponentConfig | undefined;
	if (config && !Component.config) {
		Component.config = config;
	}
	ensurePageConfigLayouts(Component.config);
	return Component;
}

/**
 * Fetches and parses a page, returning its component, props, and document.
 *
 * Flow: Fetch HTML → Parse → Extract props → Extract component URL → Import module
 *
 * Handles multiple export patterns (Content, default.Content, default) for different
 * integration setups. Does NOT update DOM - caller applies changes.
 *
 * @param url - The URL to load
 * @returns Object with Component, props, doc, and finalPath, or null on error
 */
export async function loadPageModule(
	url: string,
	options: LoadPageModuleOptions = {},
): Promise<LoadedPageModule | null> {
	const fetchedPage = await fetchPageDocument(url, options);
	if (!fetchedPage) {
		return null;
	}

	return loadPageModuleFromDocument(fetchedPage.doc, fetchedPage.finalPath);
}

export async function fetchPageDocument(
	url: string,
	options: LoadPageModuleOptions = {},
): Promise<FetchedPageDocument | null> {
	try {
		const res = await fetch(url, {
			signal: options.signal,
			headers: {
				Accept: 'text/html',
			},
		});
		if (!isHtmlPageResponse(res)) {
			return null;
		}
		const html = await res.text();

		const finalUrl = new URL(res.url || url, window.location.origin);
		const finalPath = finalUrl.pathname + finalUrl.search;

		const doc = new DOMParser().parseFromString(html, 'text/html');

		return { doc, finalPath, html };
	} catch (e) {
		if (e instanceof DOMException && e.name === 'AbortError') {
			return null;
		}
		console.error('[EcoRouter] Navigation failed:', e);
		return null;
	}
}

/**
 * Loads the page module for a fetched or current document.
 *
 * The router normally extracts the page module URL from the document's
 * hydration assets. Callers can provide `options.moduleUrlOverride` when the
 * document is stale with respect to the active runtime module identity, such as
 * during HMR-driven current-page reloads.
 *
 * @param doc - Parsed destination document.
 * @param finalPath - Final route path after redirects.
 * @param options - Module loading overrides.
 * @returns Loaded page module payload or `null` when the document is not a
 * React-router page or no page component can be resolved.
 */
export async function loadPageModuleFromDocument(
	doc: Document,
	finalPath: string,
	options: LoadPageModuleFromDocumentOptions = {},
): Promise<LoadedPageModule | null> {
	const props = extractProps(doc);
	const componentUrl = options.moduleUrlOverride ?? (await extractComponentUrl(doc));

	if (!componentUrl) {
		if (isReactRouteDocument(doc)) {
			console.error('[EcoRouter] Could not find component URL');
		}
		return null;
	}

	const moduleUrl = addCacheBuster(componentUrl);
	const module = (await import(/* @vite-ignore */ moduleUrl)) as unknown;
	const Component = adaptPageModule(module);
	if (!Component) {
		console.error('[EcoRouter] No component found in module');
		return null;
	}

	return { Component, props, doc, finalPath, moduleUrl: componentUrl };
}
