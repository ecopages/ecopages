# @ecopages/browser-router

Client-side navigation and view transitions for Ecopages. Intercepts same-origin link clicks to provide smooth page transitions without full page reloads.

## Features

- **Client-side navigation** - Intercepts `<a>` clicks for fast navigation
- **Efficient DOM diffing** - Uses [morphdom](https://github.com/patrick-steele-idem/morphdom) to update only what changed, preserving scroll positions and internal state
- **State persistence** - Elements with `data-eco-persist` are never recreated, preserving internal state
- **View Transitions** - Optional integration with the View Transition API
- **Lifecycle events** - Hook into navigation with `eco:before-swap`, `eco:after-swap`, `eco:page-load`

## Compatibility

This package works with MPA-style rendering (KitaJS, Lit, vanilla JS) where the server returns full HTML pages.

**Not compatible with React/Preact** - These frameworks manage their own virtual DOM and component trees. Replacing the DOM breaks hydration, state, and event handlers. For React apps, use a framework-specific routing solution.

## Installation

```bash
bunx jsr add @ecopages/browser-router
```

## Usage

Create and start the router in a **global** client-side script (e.g., `src/layouts/base-layout.script.ts`).

> **Important**: Ensure the router script is injected in a **consistent order** within the `<head>` across all pages. Inconsistent ordering (e.g. script between styles on one page but after on another) causes `morphdom` to reload styles, leading to a "Flash of Unstyled Content" (FOUC).

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

| Option             |              Type               |       Default        | Description                                    |
| :----------------- | :-----------------------------: | :------------------: | :--------------------------------------------- |
| `linkSelector`     |            `string`             |     `'a[href]'`      | Selector for links to intercept                |
| `persistAttribute` |            `string`             | `'data-eco-persist'` | Attribute to mark elements for DOM persistence |
| `reloadAttribute`  |            `string`             | `'data-eco-reload'`  | Attribute to force full page reload            |
| `updateHistory`    |            `boolean`            |        `true`        | Whether to update browser history              |
| `scrollBehavior`   | `'top' \| 'preserve' \| 'auto'` |       `'top'`        | Scroll behavior after navigation               |
| `viewTransitions`  |            `boolean`            |       `false`        | Use View Transition API for animations         |
| `smoothScroll`     |            `boolean`            |       `false`        | Use smooth scrolling during navigation         |

## Persistence

Mark elements to preserve across navigations. These elements are never recreated during navigation, morphdom skips them entirely, preserving their internal state (event listeners, web component state, form values, etc.):

```html
<!-- This counter keeps its state across all navigations -->
<radiant-counter data-eco-persist="counter"></radiant-counter>
```

## Script Re-execution

To force a script to re-execute on every navigation (e.g. analytics, hydration), add `data-eco-rerun` and `data-eco-script-id`:

```html
<script data-eco-rerun="true" data-eco-script-id="analytics">
	// This runs on every navigation
	trackPageview();
</script>
```

## Force Full Reload

Use `data-eco-reload` to force a full page reload:

```html
<a href="/logout" data-eco-reload>Logout</a>
```

## Events

Listen to navigation lifecycle events:

```ts
document.addEventListener('eco:before-swap', (e) => {
	console.log('Navigating to:', e.detail.url);
	// Call e.detail.reload() to abort and do full reload
});

document.addEventListener('eco:after-swap', (e) => {
	console.log('Swapped to:', e.detail.url);
});

document.addEventListener('eco:page-load', (e) => {
	console.log('Page loaded:', e.detail.url);
});
```

## Programmatic Navigation

```ts
import { createRouter } from '@ecopages/browser-router/client';

const router = createRouter();

// Navigate with pushState
await router.navigate('/new-page');

// Navigate with replaceState
await router.navigate('/new-page', { replace: true });
```
