/**
 * The component type a React module renders in place of an Eco Component another Integration owns.
 *
 * @remarks
 * The React client graph rewrites each import of such a Component to {@link foreignBoundary}, so the boundary is a
 * property of how React modules are built and the Eco browser factory renders inline for every caller. The
 * boundary keeps the Component's server HTML instead of calling its `render`, which returns output React cannot
 * render, such as a Lit `TemplateResult`.
 *
 * @module
 */

import { createElement, useState, type ComponentType } from 'react';
import { isProductionRuntime, type EcoComponent } from '@ecopages/core';
import { REACT_PLUGIN_NAME } from '../../plugin/react.constants.ts';
import {
	FOREIGN_SUBTREE_DISPLAY,
	FOREIGN_SUBTREE_KEY_ATTRIBUTE,
	FOREIGN_SUBTREE_TAG,
	getForeignSubtreeKey,
} from '../foreign-subtree.ts';

type ForeignSubtreeWindow = Window & {
	__ECO_PAGES__?: {
		page?: { document?: Document };
	};
};

/**
 * Returns the server HTML of the Foreign Subtree named `key`.
 *
 * @remarks
 * Every mount reads it, hydration included, where React keeps the existing DOM whatever was read. A client
 * navigation publishes the fetched document as `page.document` before it renders the next Page, and that document
 * comes first, and a direct HMR update publishes the document it fetched the same way; otherwise the live document
 * holds it. Without either, the boundary stays empty and warns.
 */
function readServerHtml(key: string): string {
	const selector = `${FOREIGN_SUBTREE_TAG}[${FOREIGN_SUBTREE_KEY_ATTRIBUTE}="${key}"]`;
	const navigationDocument = (window as ForeignSubtreeWindow).__ECO_PAGES__?.page?.document;
	for (const source of [navigationDocument, document]) {
		const boundary = source?.querySelector(selector);
		if (boundary) return boundary.innerHTML;
	}
	return '';
}

/**
 * Gives a freshly created boundary its server HTML with the declarative shadow roots in it.
 *
 * @remarks
 * React creates the boundary empty, and a boundary that hydrates already holds its HTML, so only an empty one is
 * filled. `setHTMLUnsafe()` parses declarative shadow roots, where React's `innerHTML` would leave them inert
 * templates. A custom element in that HTML, Lit's included, upgrades with its server-rendered shadow root and can
 * hydrate it instead of rendering again. A browser without `setHTMLUnsafe()` falls back to `innerHTML`, so a
 * custom element there renders itself on the client.
 */
function fillBoundary(boundary: Element | null, html: string): void {
	if (!boundary || boundary.hasChildNodes() || !html) return;
	if (typeof boundary.setHTMLUnsafe === 'function') {
		boundary.setHTMLUnsafe(html);
	} else {
		boundary.innerHTML = html;
	}
}

const BOUNDARY_STYLE = { display: FOREIGN_SUBTREE_DISPLAY };

const warnedKeys = new Set<string>();

/**
 * Warns once per key, outside production, that a boundary found no server HTML and stays empty.
 *
 * @remarks
 * The supported path is a Foreign Subtree the server rendered inside the hydrating tree, with the props it had
 * there. A foreign Component that first renders on the client, or a client-only prop change, has no server HTML
 * to keep, and the boundary cannot render the Component itself.
 */
function warnEmptyBoundary(key: string, component: EcoComponent): void {
	if (isProductionRuntime() || warnedKeys.has(key)) return;
	warnedKeys.add(key);
	const file = component.config?.identity?.file ?? component.config?.identity?.id ?? 'a foreign Component';
	console.warn(
		`[ecopages] The foreign Component ${file} has no server HTML for the subtree "${key}", so it renders empty. ` +
			`A foreign Component renders in React only where the server rendered it with the same props.`,
	);
}

function ForeignSubtree({ subtreeKey, component }: { subtreeKey: string; component: EcoComponent }) {
	const [boundary] = useState(() => {
		const html = readServerHtml(subtreeKey);
		if (!html) warnEmptyBoundary(subtreeKey, component);
		return { emptyHtml: { __html: '' }, ref: (element: Element | null) => fillBoundary(element, html) };
	});
	return createElement(FOREIGN_SUBTREE_TAG, {
		[FOREIGN_SUBTREE_KEY_ATTRIBUTE]: subtreeKey,
		style: BOUNDARY_STYLE,
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: boundary.emptyHtml,
		ref: boundary.ref,
	});
}

const boundaries = new WeakMap<object, ComponentType<Record<string, unknown>>>();

function isForeignEcoComponent(value: unknown): value is EcoComponent {
	if (typeof value !== 'function') return false;
	const config = (value as EcoComponent).config;
	return config?.identity !== undefined && (config.integration ?? config.identity.integration) !== REACT_PLUGIN_NAME;
}

/**
 * Returns the component type React renders for `value`: a boundary when it is an Eco Component another
 * Integration owns, `value` itself otherwise.
 *
 * @remarks
 * The boundary is keyed by its subtree key, so new props re-mount it and read the matching server HTML. It passes
 * the same `dangerouslySetInnerHTML` object and the same `ref` on every render, because React compares a custom
 * element's props by reference and a new object would rewrite the live DOM inside. The object is empty: a
 * hydrating boundary keeps the DOM it finds, and a created one is filled by {@link fillBoundary} once React has
 * attached it, so its declarative shadow roots survive; see the Islands and hydration developer page.
 *
 * One boundary type per Component keeps React from re-mounting it on a parent render.
 */
export function foreignBoundary<T>(value: T): T {
	if (!isForeignEcoComponent(value)) return value;
	let boundary = boundaries.get(value);
	if (!boundary) {
		boundary = (props) => {
			const subtreeKey = getForeignSubtreeKey(value, props);
			return createElement(ForeignSubtree, { key: subtreeKey, subtreeKey, component: value });
		};
		boundaries.set(value, boundary);
	}
	return boundary as T;
}

/**
 * Wraps a namespace import of a module another Integration owns, so `ns.Component` is its boundary.
 */
export function foreignBoundaryNamespace<T extends object>(namespace: T): T {
	return new Proxy(namespace, {
		get: (target, property, receiver) => foreignBoundary(Reflect.get(target, property, receiver)),
	});
}
