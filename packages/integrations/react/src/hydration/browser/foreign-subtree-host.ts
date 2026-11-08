/**
 * Registers React as the browser Foreign Child host, so a Component another Integration owns renders as a boundary
 * that keeps its server HTML.
 *
 * @remarks
 * The bootstraps receive React as a value from the generated entry, so this module has no React import.
 *
 * @module
 */

import type { BrowserForeignChildHost } from '@ecopages/core';
import { REACT_PLUGIN_NAME } from '../../plugin/react.constants.ts';
import {
	FOREIGN_SUBTREE_DISPLAY,
	FOREIGN_SUBTREE_KEY_ATTRIBUTE,
	FOREIGN_SUBTREE_TAG,
	getForeignSubtreeKey,
} from '../foreign-subtree.ts';

/** The React functions the boundary needs. */
export type ForeignSubtreeReactRuntime = {
	createElement: (type: unknown, props: Record<string, unknown>) => unknown;
	useState: <S>(initialState: () => S) => [S, unknown];
};

type ForeignSubtreeWindow = Window & {
	__ECO_PAGES__?: {
		foreignChildHost?: BrowserForeignChildHost;
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
 * holds it. Without either, the boundary stays empty.
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

const BOUNDARY_STYLE = { display: FOREIGN_SUBTREE_DISPLAY };

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

/**
 * Registers React as the document's Foreign Child host, once.
 *
 * @remarks
 * The first registration wins: replacing the host would give the boundary a new component type and make React
 * re-mount every Foreign Subtree. The boundary is keyed by its subtree key, so new props re-mount it and read the
 * matching server HTML. It passes the same `dangerouslySetInnerHTML` object and the same `ref` on every render,
 * because React compares a custom element's props by reference and a new object would rewrite the live DOM inside.
 * The object is empty: a hydrating boundary keeps the DOM it finds, and a created one is filled by
 * {@link fillBoundary} once React has attached it, so its declarative shadow roots survive; see the Islands and
 * hydration developer page.
 *
 * The host is global to the document: once registered, a browser call of any Component another Integration owns
 * returns this boundary, also outside a React render.
 */
export function installForeignSubtreeHost(runtime: ForeignSubtreeReactRuntime): void {
	const pageRuntime = ((window as ForeignSubtreeWindow).__ECO_PAGES__ ??= {});
	if (pageRuntime.foreignChildHost) return;

	function ForeignSubtree({ subtreeKey }: { subtreeKey: string }): unknown {
		const [boundary] = runtime.useState(() => {
			const html = readServerHtml(subtreeKey);
			return { emptyHtml: { __html: '' }, ref: (element: Element | null) => fillBoundary(element, html) };
		});
		return runtime.createElement(FOREIGN_SUBTREE_TAG, {
			[FOREIGN_SUBTREE_KEY_ATTRIBUTE]: subtreeKey,
			style: BOUNDARY_STYLE,
			suppressHydrationWarning: true,
			dangerouslySetInnerHTML: boundary.emptyHtml,
			ref: boundary.ref,
		});
	}

	pageRuntime.foreignChildHost = {
		integration: REACT_PLUGIN_NAME,
		renderForeignChild: (component, props) => {
			const subtreeKey = getForeignSubtreeKey(component, props);
			return runtime.createElement(ForeignSubtree, { key: subtreeKey, subtreeKey });
		},
	};
}
