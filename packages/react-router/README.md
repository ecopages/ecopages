# @ecopages/react-router

Client-side SPA router for Ecopages React applications. Features single-page application navigation while preserving all the benefits of Server-Side Rendering (SSR).

## Features

- **SSR preserved**: Initial loads are fully server-rendered.
- **Opt-in via config**: A single line in your config enables SPA navigation across all pages.
- **Layout persistence**: Shared layouts stay mounted while page content swaps.
- **Standard links**: Works with regular `<a>` tags.
- **Head sync**: Automatically updates document metadata `<head>` during navigation.
- **View Transitions**: Built-in support for the browser View Transitions API.

## Cross-Runtime Handoff

`@ecopages/react-router` only performs SPA updates for React-managed documents. When a navigation resolves to a non-React document, it will:

- hand the already-fetched HTML document to `@ecopages/browser-router` when browser-router is registered on the page
- fall back to a normal document navigation when browser-router is not present

This keeps React-router focused on React rendering while still allowing mixed React and non-React pages to transition without a second fetch when browser-router is active.

## Installation

```bash
bun add @ecopages/react-router
```

## Quick Start

Pass the router adapter to the React plugin in your `eco.config.ts`:

```typescript
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setIntegrations([reactPlugin({ router: ecoRouter() })])
	.build();

export default config;
```

SPA navigation is now enabled for all React pages in your project.

If your site mixes React pages with non-React pages, you can also run `@ecopages/browser-router` on the non-React shell. React-router will hand off non-React navigations to browser-router when it is available.

## Usage

### Layouts (Optional)

Configure your page with a layout to keep UI components (like headers/navs) mounted across navigations:

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

Standard relative links are intercepted natively. To bypass the router and force a hard reload, use the `data-eco-reload` attribute.

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

## View Transitions

The router automatically integrates with the [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API).

To animate elements between pages using Shared Element Transitions, mark them with a unique `data-view-transition` id that matches across both pages:

```tsx
// List Page
<img src={post.image} data-view-transition={`hero-${post.id}`} />

// Detail Page
<img src={post.image} data-view-transition={`hero-${post.id}`} />
```

By default, we impose a "clean morph", disabling default cross-fade ghosting. To use standard crossfades on elements, opt-out:

```tsx
<div data-view-transition="my-hero" data-view-transition-animate="fade">
	...
</div>
```

## How It Works

The router relies on **HTML-First** navigation to sync perfectly with SSR:

1. **SSR**: Initial page arrives completely rendered.
2. **Hydration**: Client hydrates and the router attaches.
3. **Navigation**: On click, the router:
    - Fetches the raw HTML of the next route.
    - Extracts page-level serialized props and metadata.
    - Preloads the next page component via dynamic import.
    - Updates React state, syncs `<head>`, and triggers `startViewTransition`.
    - The React graph reconciles and the animation plays.
