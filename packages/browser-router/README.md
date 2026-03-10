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
});
```

## Configuration

| Option             | Type                            | Default              | Description                                    |
| :----------------- | :------------------------------ | :------------------- | :--------------------------------------------- |
| `linkSelector`     | `string`                        | `'a[href]'`          | Selector for links to intercept                |
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

To force a script to re-execute on every navigation (e.g., analytics), add `data-eco-rerun` and `data-eco-script-id`:

```html
<script data-eco-rerun="true" data-eco-script-id="analytics">
	trackPageview();
</script>
```

> [!NOTE]
> For React islands, hydration scripts may need to run again after `eco:after-swap`. These bootstraps should carry stable `data-eco-script-id` metadata and use `data-eco-rerun` to execute safely during head reconciliation.

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
