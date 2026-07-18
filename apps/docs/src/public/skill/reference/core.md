# Core Concepts

## Contents

- Project structure
- The eco namespace
- Pages and views
- Components
- Metadata and SEO
- Common patterns
- Best practices

## Project structure

```
project/
├── src/
│   ├── pages/          # Static routes (eco.page, MDX)
│   ├── views/          # Handler-rendered views
│   ├── layouts/
│   ├── components/
│   ├── handlers/
│   ├── includes/       # html.*, head.*, seo.*
│   ├── lib/
│   └── styles/
├── public/
├── eco.config.ts
└── package.json
```

Semantic discovery: `src/includes/html.*`, `src/pages/404.*`, and `src/pages/500.*` resolve by basename and integration extension.

## The eco namespace

- `eco.component()` — reusable components; **required** when declaring dependencies (scripts, stylesheets, child components)
- `eco.page()` — page routes with metadata, layouts, `staticPaths`, `staticProps`
- `eco.layout()` / `eco.html()` — semantic aliases for layouts and document shell

Ecopages does not auto-detect script files by name pattern.

## Pages and views

**Pages (`src/pages/`)** — file-based static routes.

**Views (`src/views/`)** — rendered from handlers via `ctx.render()`. Must use `eco.page<Props>()` and dynamic `import()`.

```tsx
export default eco.page({
	metadata: () => ({ title: 'My Page' }),
	render: () => <h1>Hello</h1>,
});
```

## Components

```tsx
import { eco } from '@ecopages/core';

export const MyComponent = eco.component({
	dependencies: {
		stylesheets: ['./my-component.css'],
		scripts: [{ src: './my-component.script.ts', lazy: { 'on:visible': true } }],
	},
	render: ({ title }) => <h2>{title}</h2>,
});
```

## Metadata and SEO

Defaults in `eco.config.ts` via `.setDefaultMetadata()`. Page metadata merges automatically and flows to `html.tsx` → `Head` → `Seo`.

```tsx
export default eco.page({
	metadata: () => ({
		title: 'My Page',
		description: 'Page description',
	}),
	render: () => <div>Content</div>,
});
```

## Common patterns

**Dynamic routes:** `src/pages/blog/[slug].tsx` with `staticProps` reading `pathname.params`.

**Data fetching:** Prefer direct function calls in `staticPaths` / `staticProps` over HTTP to your own API during static generation.

## Best practices

1. Use `eco.page()` for routable pages
2. Declare dependencies explicitly
3. Organize by feature
4. Use CSS variables with Tailwind v4 `@theme`
5. Match MDX to the owning integration plugin
