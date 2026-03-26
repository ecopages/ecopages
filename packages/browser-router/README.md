# @ecopages/browser-router

Client-side navigation and view transitions for Ecopages. It intercepts same-origin link clicks to provide smooth page transitions without full page reloads.

## Features

- **Client-side navigation**: Intercepts `<a>` clicks for robust, fast navigation.
- **Efficient DOM diffing**: Uses [morphdom](https://github.com/patrick-steele-idem/morphdom) to update only what changed, preserving scroll positions and internal state.
- **State persistence**: Elements with `data-eco-persist` are never recreated, preserving Web Component state, event listeners, and form values.
- **View Transitions**: Optional integration with the View Transition API.
- **Lifecycle events**: Hook into navigation with `eco:before-swap`, `eco:after-swap`, `eco:page-load`.

## Compatibility

This package is designed for MPA-style rendering where the server returns full HTML pages (e.g., KitaJS, Lit, vanilla JS, or component-level React islands).

> [!WARNING]
> **Not compatible with full React applications.**
> If you are building a React application, use [@ecopages/react-router](../react-router/README.md) instead, as React manages its own virtual DOM and hydration lifecycle.

> [!NOTE]
> `@ecopages/browser-router` can still participate in mixed sites that contain both React-router pages and non-React pages. In that setup, browser-router remains responsible for DOM-swapping non-React documents, and React-router can hand off already-fetched non-React pages to it through the shared navigation coordinator.

## Installation

```bash
bunx jsr add @ecopages/browser-router
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

By default, browser-router only syncs root `<html>` metadata it owns. Client-managed attributes and classes such as theme state are preserved unless you explicitly include them in `documentElementAttributesToSync`.

For advanced cases, browser-router also exports low-level document sync tooling without changing the router instance API:

```ts
import {
	createRouter,
	defaultDocumentElementAttributesToSync,
	syncDocumentElementAttributes,
} from '@ecopages/browser-router';

const router = createRouter();

document.addEventListener('eco:before-swap', (event) => {
	syncDocumentElementAttributes(document, event.detail.newDocument, [
		...defaultDocumentElementAttributesToSync,
		'data-theme',
	]);
});
```

Loading the router script is the opt-in point for browser-router-managed navigation on that page shell. Pages without the router script continue to use normal document navigation.

## Configuration

| Option             | Type                            | Default              | Description                                    |
| :----------------- | :------------------------------ | :------------------- | :--------------------------------------------- |
| `linkSelector`     | `string`                        | `'a[href]'`          | Selector for links to intercept                |
| `documentElementAttributesToSync` | `string[]`         | `['lang', 'dir', 'data-eco-document-owner']` | `<html>` attributes to sync from the incoming document; other root attributes are preserved |
| `persistAttribute` | `string`                        | `'data-eco-persist'` | Attribute to mark elements for DOM persistence |
| `reloadAttribute`  | `string`                        | `'data-eco-reload'`  | Attribute to force full page reload            |
| `updateHistory`    | `boolean`                       | `true`               | Whether to update browser history              |
| `scrollBehavior`   | `'top' \| 'preserve' \| 'auto'` | `'top'`              | Scroll behavior after navigation               |
| `viewTransitions`  | `boolean`                       | `false`              | Use View Transition API for animations         |
| `smoothScroll`     | `boolean`                       | `false`              | Use smooth scrolling during navigation         |

## Persistence

Mark elements to preserve across navigations. These elements are never recreated during navigation; morphdom skips them entirely.

```html
<!-- This counter keeps its internal state across all navigations -->
<radiant-counter data-eco-persist="counter"></radiant-counter>
```

## Script Re-execution

To force a script to re-execute on every navigation (e.g., analytics), add `data-eco-rerun`:

```html
<script data-eco-rerun="true">
	trackPageview();
</script>
```

> [!NOTE]
> `data-eco-script-id` is optional. Use it when you want an explicit stable identity for a rerun script. Otherwise the router falls back to matching by original `src` and inline content.

## Force Full Reload

Use `data-eco-reload` on an anchor tag to bypass the router and force a full page reload:

```html
<a href="/logout" data-eco-reload>Logout</a>
```

## Events

Listen to navigation lifecycle events on the `document`:

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
