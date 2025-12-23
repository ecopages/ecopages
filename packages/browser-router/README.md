# @ecopages/browser-router

Client-side navigation and view transitions for Ecopages. Intercepts same-origin link clicks to provide smooth page transitions without full page reloads.

## Features

- **Client-side navigation** — Intercepts `<a>` clicks for fast navigation
- **Smart DOM swapping** — Preserves stylesheets/scripts, replaces content
- **View Transitions** — Optional integration with the View Transition API
- **State persistence** — Keep elements across navigations with `data-eco-persist`
- **Scroll persistence** — Restore scroll positions for specific elements
- **Lifecycle events** — Hook into navigation with `eco:before-swap`, `eco:after-swap`, `eco:page-load`

## Compatibility

This package works with MPA-style rendering (KitaJS, Lit, vanilla JS) where the server returns full HTML pages.

**Not compatible with React/Preact** — These frameworks manage their own virtual DOM and component trees. Replacing the DOM breaks hydration, state, and event handlers. For React apps, use a framework-specific routing solution.

## Installation

```bash
bunx jsr add @ecopages/browser-router
```

## Usage

Create and start the router in a client-side script:

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

| Option                   |              Type               |           Default           | Description                                    |
| :----------------------- | :-----------------------------: | :-------------------------: | :--------------------------------------------- |
| `linkSelector`           |            `string`             |         `'a[href]'`         | Selector for links to intercept                |
| `persistAttribute`       |            `string`             |    `'data-eco-persist'`     | Attribute to mark elements for DOM persistence |
| `reloadAttribute`        |            `string`             |     `'data-eco-reload'`     | Attribute to force full page reload            |
| `scrollPersistAttribute` |            `string`             | `'data-eco-scroll-persist'` | Attribute for scroll position persistence      |
| `updateHistory`          |            `boolean`            |           `true`            | Whether to update browser history              |
| `scrollBehavior`         | `'top' \| 'preserve' \| 'auto'` |           `'top'`           | Scroll behavior after navigation               |
| `viewTransitions`        |            `boolean`            |           `false`           | Use View Transition API for animations         |
| `smoothScroll`           |            `boolean`            |           `false`           | Use smooth scrolling during navigation         |

## Persistence

Mark elements to preserve across navigations:

```html
<nav data-eco-persist="main-nav">Navigation stays intact</nav>
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
