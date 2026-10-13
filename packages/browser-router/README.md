# @ecopages/browser-router

Client-side navigation and view transitions for Ecopages. It intercepts same-origin link clicks to provide smooth page transitions without full page reloads.

## Features

- **Client-side navigation**: Intercepts `<a>` clicks for robust, fast navigation.
- **Efficient DOM diffing**: Uses [morphdom](https://github.com/patrick-steele-idem/morphdom) to update only what changed, preserving scroll positions and internal state.
- **State persistence**: Elements with `data-eco-persist` are never recreated, preserving Web Component state, event listeners, and form values.
- **View Transitions**: Optional integration with the View Transition API.
- **Lifecycle events**: Hook into navigation with `eco:before-swap`, `eco:after-swap`, `eco:page-load`.

The core navigation pipeline shares document fetching, parsing, prefetch cache, head reconciliation, stylesheet staging, script activation, named view transitions, and lifecycle events with `@ecopages/react-router`. Browser-router always morphs the incoming body, preserving persisted elements across navigation regardless of view-transition settings or rerun scripts. View transitions only wrap the morph; scroll restoration uses the shared post-swap hook.

## Compatibility

This package is designed for MPA-style rendering where the server returns full HTML pages (e.g., KitaJS, Lit, vanilla JS, or component-level React islands).

> [!WARNING]
> **Not compatible with full React applications.**
> If you are building a React application, use [@ecopages/react-router](../react-router/README.md) instead, as React manages its own virtual DOM and hydration lifecycle.

> [!NOTE]
> `@ecopages/browser-router` can still participate in mixed sites that contain both React-router pages and non-React pages. In that setup, browser-router remains responsible for DOM-swapping non-React documents, and React-router can hand off already-fetched non-React pages to it through the shared navigation coordinator.

## Installation

```bash
bun add @ecopages/browser-router
```

## Usage

Create and start the router in a **global** client-side script (e.g., `src/layouts/base-layout.script.ts`).

> [!IMPORTANT]
> Ensure the router script is injected in a **consistent order** within the `<head>` across all pages. Inconsistent ordering causes `morphdom` to reload styles, leading to a "Flash of Unstyled Content" (FOUC).

```ts
import { createRouter } from '@ecopages/browser-router/client';

// Creates and starts the router with default options
const router = createRouter();
```

With custom options:

```ts
import { createRouter } from '@ecopages/browser-router/client';

const router = createRouter({
	viewTransitions: true,
	scrollBehavior: 'auto',
	documentElementAttributesToSync: ['lang', 'dir', 'data-theme'],
});
```

By default, when view transitions are enabled, the router opts the document out of the UA root group (no lighter flash on dark themes) and only calls `startViewTransition` when a page uses `data-view-transition` shared-element morphs. Set `viewTransitions: false` to disable.

By default, browser-router only syncs root `<html>` metadata it owns. Client-managed attributes and classes such as theme state are preserved unless you explicitly include them in `documentElementAttributesToSync`.

For advanced cases, browser-router also exports low-level document sync tooling without changing the router instance API:

```ts
import {
	createRouter,
	DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC,
	syncDocumentElementAttributes,
} from '@ecopages/browser-router';

const router = createRouter();

document.addEventListener('eco:before-swap', (event) => {
	syncDocumentElementAttributes(document, event.detail.newDocument, [
		...DEFAULT_DOCUMENT_ELEMENT_ATTRIBUTES_TO_SYNC,
		'data-theme',
	]);
});
```

Loading the router script is the opt-in point for browser-router-managed navigation on that page shell. Pages without the router script continue to use normal document navigation.

## Router singleton

`createRouter()` returns a single active router per browser tab. The first call creates, starts, and stores the instance on `window.__ecopages_browser_router__`. Later calls return that same instance and ignore new options.

Call `router.stop()` before replacing the router script in long-lived sessions (for example after `data-eco-rerun` layout reloads) if you need a fresh instance with different options.

## Configuration

| Option                            | Type                            | Default                                      | Description                                                                                 |
| :-------------------------------- | :------------------------------ | :------------------------------------------- | :------------------------------------------------------------------------------------------ |
| `linkSelector`                    | `string`                        | `'a[href]'`                                  | Selector for links to intercept                                                             |
| `documentElementAttributesToSync` | `string[]`                      | `['lang', 'dir', 'data-eco-document-owner']` | `<html>` attributes to sync from the incoming document; other root attributes are preserved |
| `persistAttribute`                | `string`                        | `'data-eco-persist'`                         | Attribute to mark elements for DOM persistence                                              |
| `reloadAttribute`                 | `string`                        | `'data-eco-reload'`                          | Attribute to force full page reload                                                         |
| `updateHistory`                   | `boolean`                       | `true`                                       | Whether to update browser history                                                           |
| `scrollBehavior`                  | `'top' \| 'preserve' \| 'auto'` | `'top'`                                      | Scroll behavior after navigation                                                            |
| `viewTransitions`                 | `boolean`                       | `true`                                       | View Transition API; disables UA root crossfade by default. `false` disables.               |
| `smoothScroll`                    | `boolean`                       | `false`                                      | Use smooth scrolling during navigation                                                      |

## Persistence

Mark elements with the same persistence key on each page to preserve them across navigations. When the incoming page keeps the element under a compatible ancestor structure, it stays connected and is never recreated; morphdom skips it entirely. This holds when view transitions are disabled and when the incoming page has `data-eco-rerun` scripts. Changing the element's ancestor tags can require replacing its containing path, so keep that structure stable when connection continuity matters.

When an incoming page has a `data-eco-rerun` script, browser-router refreshes matching non-persisted elements before running it, except for the body, persisted elements, their ancestor path, and descendants of custom elements on that path. Those custom-element descendants stay in place because the connected host may have attached handlers to them. Keep handler-bound child markup structurally compatible across pages, or have the component rebind when its child markup changes; replacing a child does not reconnect the host. Event handlers installed on refreshed elements attach to new nodes instead of stacking on nodes retained by the morph. A rerun script that installs handlers on any retained node must make that registration idempotent, because those nodes remain attached across navigations.

```html
<!-- This counter keeps its internal state across all navigations -->
<radiant-counter data-eco-persist="counter"></radiant-counter>
```

## Scripts on navigation

After the swap, a head script runs only if the previous page's head did not have it, and body scripts run on every navigation, as in Turbo: the body is new content even when the previous page had the same script. That covers inline scripts and external classic scripts; an external module script runs only once per URL in a tab, because the browser evaluates each module URL once. A classic script's top-level `const`, `let` and `class` declarations live in the page's global scope, so when a classic body script runs again they are declared twice and throw `SyntaxError: Identifier '…' has already been declared`. Write such a script without them (use `var` or functions, or wrap the code in a block or an IIFE), or make it a module script, which runs once per URL, and listen for `eco:page-load` for code that must run on each visit. A script inside an element marked `data-eco-persist` is kept as it was and does not run again. Scripts run in one sequence: new head scripts, then `data-eco-rerun` scripts, then body scripts, each group in document order. Each waits until earlier blocking scripts (external classic scripts without `async`, `defer`, or `nomodule`) have loaded, as during page parsing, so an inline script that uses a library the page loads runs after it. External `defer` and module scripts keep that insertion order too; only scripts the page marks `async` run as soon as they load. If the next navigation swaps the page while a script is still loading, the rest of the previous sequence does not run.

## Script Re-execution

To force a head script to re-execute on every navigation (e.g., analytics), add `data-eco-rerun`:

```html
<script data-eco-rerun="true">
	trackPageview();
</script>
```

> [!NOTE]
> `data-eco-script-id` is optional. Use it when you want an explicit stable identity for a rerun script. Without it, an HTML `id` takes precedence; otherwise the router matches by original `src` or inline content. When matching by a relative `src`, the identity stays the same across different `<base>` URLs, while an external module reruns from the incoming page's resolved URL.

## Force Full Reload

Use `data-eco-reload` on an anchor tag to bypass the router and force a full page reload:

```html
<a href="/logout" data-eco-reload>Logout</a>
```

## Events

Listen to navigation lifecycle events on the `document`. Event detail types live in `@ecopages/core/router/navigation-lifecycle`.

```ts
document.addEventListener('eco:before-swap', (e) => {
	console.log('Navigating to:', e.detail.url);
	// Call e.detail.reload() to abort client-side navigation and do a full reload
});

document.addEventListener('eco:after-swap', (e) => {
	console.log('Swapped to:', e.detail.url);
});

document.addEventListener('eco:page-load', (e) => {
	console.log('Page loaded:', e.detail.url);
});
```

## Programmatic Navigation

Use the router instance to navigate programmatically:

```ts
import { createRouter } from '@ecopages/browser-router/client';

const router = createRouter();

// Navigate with pushState
await router.navigate('/new-page');

// Navigate with replaceState
await router.navigate('/new-page', { replace: true });
```
