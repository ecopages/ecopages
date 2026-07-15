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

const ROUTER_PROPS_SCRIPT_ID = '__ECO_PAGE_DATA__';
const PAGE_BOOTSTRAP_SELECTOR = 'script[data-eco-page-bootstrap="react-router"]';

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
	 * document page-data payload.
	 *
	 * React Router uses this during HMR-driven reloads so the active hot module
	 * entry wins over any static bootstrap asset references embedded in the HTML.
	 */
	moduleUrlOverride?: string;
};

/**
 * Reads the runtime page-module marker set by hydration for the current document.
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

/**
 * Extracts serialized page props from window.__ECO_PAGES__.page or fetched document.
 *
 * @remarks
 * For the current document, returns props set by the hydration script.
 * For fetched documents, parses `#__ECO_PAGE_DATA__` directly.
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
 * @remarks
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
 * Extracts the browser-importable page module URL from a document.
 *
 * @remarks
 * Discovery order:
 * 1. `#__ECO_PAGE_DATA__` envelope (`schemaVersion` + `moduleUrl`)
 * 2. `window.__ECO_PAGES__.page.module` on the current document
 * 3. `script[data-eco-page-bootstrap="react-router"]` `src` (the page entry asset)
 *
 * Hydration JavaScript is never parsed. Documents without an explicit module
 * source return `null`.
 */
export async function extractComponentUrl(doc: Document): Promise<string | null> {
	const manifestUrl = resolveEcoPageDataModuleUrl(parsePageDataPayload(doc));
	if (manifestUrl) {
		return manifestUrl;
	}

	const markerUrl = extractComponentUrlFromMarker(doc);
	if (markerUrl) {
		return markerUrl;
	}

	const bootstrapScript = doc.querySelector<HTMLScriptElement>(PAGE_BOOTSTRAP_SELECTOR);
	return bootstrapScript?.src || null;
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
 * @remarks
 * Flow: fetch HTML → parse → extract props → extract module URL → import module.
 * Does not update the DOM; the caller applies changes.
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
 * @remarks
 * The router extracts the page module URL from the document page-data payload or
 * bootstrap marker. Callers can provide `options.moduleUrlOverride` when the
 * document is stale with respect to the active runtime module identity, such as
 * during HMR-driven current-page reloads.
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
