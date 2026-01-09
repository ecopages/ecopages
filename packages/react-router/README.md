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

## How It Works

1. **SSR**: Server renders full HTML
2. **Hydration**: Client hydrates, router wraps the tree
3. **Navigation**: On link click:
    - Fetch target page HTML
    - Extract component URL and props
    - Dynamic import the page module
    - Update head elements
    - Render new page (layout stays mounted)

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
