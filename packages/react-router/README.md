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

Configure your page with a declared layout to keep UI (headers, navs, sidebars) mounted across navigations:

```tsx
// src/layouts/base-layout.tsx
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

export const BaseLayout = eco.layout<{ children: ReactNode }>({
	render: ({ children }) => (
		<>
			<header>My Site</header>
			<main>{children}</main>
		</>
	),
});

// src/pages/index.tsx
import { eco } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	render: () => <h1>Welcome</h1>,
});
```

#### Nested layouts and shared parents

Pages declare an outer→inner stack with `layout: [Outer, Inner]` on `eco.page()`. Each tier is cached independently by Eco metadata (`config.__eco.file` or `id`). Two routes such as `[AppShell, DocsSection]` and `[AppShell, SettingsSection]` share one mounted **AppShell** instance when `persistLayouts` is enabled (the default with `ecoRouter()`): React state in the shell survives SPA navigation while the inner tier swaps.

A full document reload, HMR, or bootstrap that sets `refreshPersistedLayout` may replace a cached tier when the imported layout function reference changes, even when the cache key is unchanged.

```tsx
// src/pages/docs/index.tsx
import { eco } from '@ecopages/core';
import { AppShell } from '../../layouts/app-shell';
import { DocsSection } from '../../layouts/docs-section';

export default eco.page({
	layout: [AppShell, DocsSection],
	render: () => <h1>Docs</h1>,
});

// src/pages/settings/index.tsx — reuses the same AppShell cache key
import { eco } from '@ecopages/core';
import { AppShell } from '../../layouts/app-shell';
import { SettingsSection } from '../../layouts/settings-section';

export default eco.page({
	layout: [AppShell, SettingsSection],
	render: () => <h1>Settings</h1>,
});
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
	const { navigate, isNavigating } = useRouter();

	return (
		<button onClick={() => navigate('/about')} disabled={isNavigating}>
			Go to About
		</button>
	);
};
```

## View Transitions

The router automatically integrates with the [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API).

When enabled (default), the router opts the document out of the UA root view-transition group and only runs `startViewTransition` for `data-view-transition` shared-element morphs. Set `viewTransitions: false` to disable entirely.

**Visual regression check:** dark background page → SPA navigate → no lighter flash with defaults.

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

## Page data protocol

Router-enabled documents emit a JSON script that SPA navigation reads without parsing hydration JavaScript:

```html
<script id="__ECO_PAGE_DATA__" type="application/json">
	{
		"schemaVersion": 1,
		"navigationOwner": "react-router",
		"moduleUrl": "/assets/pages/about.js",
		"props": { "params": {}, "query": {} }
	}
</script>
```

In a React HTML shell, pass the transport field explicitly:

```tsx
import { EcoPropsScript } from '@ecopages/react-router';

render: ({ children, metadata, headContent, language = 'en', pageProps, pageModuleUrl }) => (
	<html lang={language}>
		<head>
			{/* … */}
			<EcoPropsScript data={pageProps} moduleUrl={pageModuleUrl} />
		</head>
		<body>{children}</body>
	</html>
);
```

Important:

- Hydration uses envelope `props` only. Envelope `moduleUrl` is for navigation module discovery.
- Pass `HtmlTemplateProps.pageModuleUrl` into `<EcoPropsScript moduleUrl={...} />`.
- `pageModuleUrl` is transport-only; it is not page component state.
- When `#__ECO_PAGE_DATA__` yields no valid envelope `moduleUrl`, discovery falls back to `window.__ECO_PAGES__.page.module`, then `script[data-eco-page-bootstrap="react-router"]` `src`.
- HMR reloads can pass an explicit `moduleUrlOverride` and bypass document discovery.

## How It Works

The router relies on **HTML-First** navigation to sync perfectly with SSR:

1. **SSR**: Initial page arrives completely rendered.
2. **Hydration**: Client hydrates and the router attaches.
3. **Navigation**: On click, `resolveReactNavigation` returns an explicit outcome:
    - `spa`: fetch HTML → read `#__ECO_PAGE_DATA__` → dynamic-import `moduleUrl` → morph `<head>`, update history, commit React state (optional `startViewTransition`).
    - `handoff`: fetched document has no React page module → coordinator hands off to browser-router (hard `assign` if handoff fails).
    - `hard-navigation`: static-asset URL or failed fetch → `location.assign` / `location.href`.
    - `stale`: a newer navigation superseded this attempt.
    - `isNavigating` clears on every non-stale terminal (including handoff and hard fallback); stale attempts leave it for the newer owner.
