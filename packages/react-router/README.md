# @ecopages/react-router

Client-side SPA router for EcoPages React applications. Enables single-page application navigation while maintaining SSR benefits.

## Installation

```bash
npm install @ecopages/react-router
# or
bun add @ecopages/react-router
```

## Overview

This router fetches full HTML pages, parses them for components and props, and dynamically renders them client-side without full page reloads. This approach:

- Preserves full SSR benefits (SEO, initial paint)
- Enables SPA-like navigation (no page flicker)
- Works with standard `<a>` tags (no special components needed)
- Automatically syncs `<head>` elements (stylesheets, meta, title)

## Usage

### 1. Add Props Script to Your HTML Template

```tsx
import { EcoPropsScript } from '@ecopages/react-router';

const HtmlTemplate = ({ children, pageProps }) => (
	<html>
		<head>...</head>
		<EcoPropsScript data={pageProps} />
		{children}
	</html>
);
```

### 2. Wrap Your Pages with EcoReactRouter

```tsx
import { EcoReactRouter } from '@ecopages/react-router';

const PageContent = (props) => (
	<main>
		<h1>Hello World</h1>
		<a href="/about">About</a>
	</main>
);

const Page = (props) => (
	<EcoReactRouter initialComponent={PageContent} initialProps={props}>
		{({ Component, props }) => <Component {...props} />}
	</EcoReactRouter>
);

// Export Content for the router to use during navigation
export const Content = PageContent;
export default Page;
```

### 3. Use Standard Anchor Tags

```tsx
// These links will be intercepted automatically
<a href="/about">About</a>
<a href="/blog">Blog</a>

// Opt out with data-eco-reload
<a href="/external" data-eco-reload>External Link</a>
```

## API

### `EcoReactRouter`

Root component that enables SPA navigation.

```tsx
interface EcoReactRouterProps {
	initialComponent: ComponentType<any>;
	initialProps: Record<string, any>;
	children: (current: { Component; props }) => ReactNode;
	options?: EcoReactRouterOptions;
}
```

### `EcoPropsScript`

Serializes page props for client-side extraction.

```tsx
interface EcoPropsScriptProps {
	data: Record<string, any>;
}
```

### `useRouter`

Hook to access navigation programmatically.

```tsx
const { navigate, isPending } = useRouter();

// Navigate programmatically
navigate('/about');
```

### Options

```tsx
interface EcoReactRouterOptions {
	linkSelector?: string; // Default: 'a[href]'
	reloadAttribute?: string; // Default: 'data-eco-reload'
	debug?: boolean; // Default: false
}
```

## How It Works

1. User clicks a link
2. Router intercepts the click (unless modifier keys or opt-out attribute)
3. Fetches the target page's full HTML
4. Parses for `__ECO_PROPS__` and hydration script
5. Dynamically imports the component module
6. Morphs `<head>` elements (stylesheets, meta, title)
7. Renders the new component without page reload

## Compatibility

- React 18.x or 19.x
- Modern browsers with ES modules support
- EcoPages SSR

## License

MIT
