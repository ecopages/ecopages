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
	/** React's `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, whose `H` is the hook dispatcher. */
	internals: { H: { useState: unknown; useEffect: unknown } | null };
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
 * comes first; otherwise the live document holds it, also during an HMR re-mount, whose old boundary is still
 * attached while React renders. Without either, the boundary stays empty.
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
 * Whether React is rendering a component right now.
 *
 * @remarks
 * React has no public API for this, so it reads the hook dispatcher `H` on React's client internals. During a
 * component render `H` is a dispatcher whose hooks differ from each other. Outside one it is `null` or React's
 * `ContextOnlyDispatcher`, which React leaves in place after its first render and whose hooks are all one function
 * that throws, so `useState` and `useEffect` are the same function. A runtime without `H` is a React this bootstrap
 * does not support, so this throws instead of leaving every Foreign Subtree to fail inside React's render.
 */
function isReactRendering(runtime: ForeignSubtreeReactRuntime): boolean {
	if (!runtime.internals || !('H' in runtime.internals)) {
		throw new Error(
			'The React client internals do not expose the hook dispatcher `H`; this React is not supported.',
		);
	}
	const dispatcher = runtime.internals.H;
	return dispatcher != null && dispatcher.useState !== dispatcher.useEffect;
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
 * The host is global to the document, but it takes a Component over only inside a React render, which
 * {@link isReactRendering} detects: another Integration's browser code calling its own Component gets that
 * Component's own result.
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
		isRendering: () => isReactRendering(runtime),
		renderForeignChild: (component, props) => {
			const subtreeKey = getForeignSubtreeKey(component, props);
			return runtime.createElement(ForeignSubtree, { key: subtreeKey, subtreeKey });
		},
	};
}
