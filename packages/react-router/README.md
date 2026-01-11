# @ecopages/react-router

Client-side SPA router for EcoPages React applications. Enables single-page application navigation while preserving full SSR benefits.

## Installation

```bash
bun add @ecopages/react-router
```

## Quick Start

Add the router adapter to your `eco.config.ts`:

```typescript
import { ConfigBuilder } from '@ecopages/core';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setIntegrations([reactPlugin({ router: ecoRouter() })])
	.build();

export default config;
```

That's it! All pages now have SPA navigation enabled.

## Features

- **Opt-in via config** - Single line enables SPA for all pages
- **SSR preserved** - Full server-side rendering on initial load
- **Layout persistence** - Layouts stay mounted, only page content swaps
- **Standard links** - Works with regular `<a>` tags
- **Head sync** - Automatically updates title, meta, and stylesheets
- **Pluggable** - Extensible adapter pattern

## Usage

### Layouts (Optional)

Use `config.layout` for persistent UI across navigations:

```tsx
// src/layouts/base-layout.tsx
export const BaseLayout = ({ children }) => (
	<html>
		<body>
			<header>My Site</header>
			<main>{children}</main>
		</body>
	</html>
);

// src/pages/index.tsx
import { BaseLayout } from '../layouts/base-layout';

const HomePage = () => <h1>Welcome</h1>;

HomePage.config = { layout: BaseLayout };

export default HomePage;
```

### Links

```tsx
// SPA navigation (intercepted)
<a href="/about">About</a>

// Force full reload
<a href="/external" data-eco-reload>External</a>
```

### Programmatic Navigation

```tsx
import { useRouter } from '@ecopages/react-router';

const MyComponent = () => {
	const { navigate, isPending } = useRouter();

	return (
		<button onClick={() => navigate('/about')} disabled={isPending}>
			Go to About
		</button>
	);
};
```

### View Transitions

The router automatically supports the [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) for smooth page transitions.

#### Lifecycle

When a navigation occurs with View Transitions enabled:

1.  **Snapshot**: The browser captures the current state (screenshot) of the page.
2.  **Update**: React processes the state change and renders the new page.
3.  **Animate**: The browser animates from the old snapshot to the new live state.

The router uses a deferred promise mechanism to ensure React has fully finished rendering the new content before telling the browser to start the animation phase.

#### Shared Element Transitions

To animate elements between pages (e.g., a thumbnail becoming a hero image), use the `data-view-transition` attribute. Ensure the value is unique to the specific element being transitioned and matches on both pages.

```tsx
// List Page (Source)
<img
  src={post.image}
  data-view-transition={`hero-${post.id}`}
/>

// Detail Page (Destination)
<img
  src={post.image}
  data-view-transition={`hero-${post.id}`}
/>
```

By default, the router applies a **clean morph** animation (disabling the default cross-fade ghosting). If you prefer the standard browser cross-fade, you can opt-out:

```tsx
<div data-view-transition="my-hero" data-view-transition-animate="fade">
	...
</div>
```

#### Cross-Fade

By default, the router provides a smooth cross-fade for the root content. You can customize this by overriding the default view transition CSS:

```css
::view-transition-old(root),
::view-transition-new(root) {
	animation-duration: 0.5s;
}
```

## How It Works

The router uses an **HTML-First** navigation strategy to ensure consistency with Server-Side Rendering (SSR).

1.  **SSR**: Server renders full HTML for the initial page load.
2.  **Hydration**: Client hydrates, router attaches to the document.
3.  **Navigation**: On link click:
    - **Fetch**: Requests the full HTML of the target page (just like a standard browser navigation).
    - **Parse**: Extracts the page component URL and serialized props from the HTML.
    - **Preload**: Dynamically imports the new page component.
    - **Transition**:
        - Calls `document.startViewTransition()`.
        - Updates the document head (title, meta, styles).
        - Updates the React state to render the new page component.
        - Waits for React commit (useEffect).
    - **Resolve**: View Transition finishes, browser plays the animation.

## API

### `ecoRouter()`

Creates a router adapter for the React plugin.

```typescript
reactPlugin({ router: ecoRouter() });
```

### `useRouter()`

Hook for programmatic navigation.

```typescript
const { navigate, isPending } = useRouter();
```

### Link Behavior

Links are **not** intercepted when:

- Modifier keys held (Ctrl, Cmd, Shift, Alt)
- Has `target="_blank"` or `download` attribute
- Has `data-eco-reload` attribute
- Points to different origin
- Starts with `#` or `javascript:`

## Architecture

The router uses a pluggable adapter pattern:

```typescript
interface ReactRouterAdapter {
	name: string;
	bundle: { importPath; outputName; externals };
	importMapKey: string;
	components: { router; pageContent };
	getRouterProps(page, props): string;
}
```

This allows custom router implementations while keeping integration simple.

## Compatibility

- React 18.x or 19.x
- Modern browsers with ES modules
- EcoPages with React integration

## License

MIT
