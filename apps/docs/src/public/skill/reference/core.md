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
│   ├── pages/          # Static routes (eco.page, MDX, .html)
│   ├── views/          # Handler-rendered views
│   ├── layouts/
│   ├── components/
│   ├── handlers/
│   ├── includes/       # html.* (incl. html.html), head.*, seo.*
│   ├── lib/
│   ├── public/         # Copied to dist as written
│   └── styles/
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

**HTML Pages (`src/pages/**/*.html`)** — plain HTML routes with no Integration or config. A file can be a body fragment, a `<head>` plus body markup, or a full document; the doctype and wrappers are dropped and the page renders inside `src/includes/html.*`, or a built-in shell when none exists. `src/includes/html.html` is an HTML shell in plain HTML: an `<html>` with `<head>` and `<body>` and exactly one `<!-- eco:children -->` marker.

- Page `<title>`, `<base>`, canonical link, and `<meta>` with the same `name`/`property`/`http-equiv` replace the shell's in place; other head tags are added before `</head>`. `<html>`/`<body>` attributes merge (classes join).
- Relative `<link rel="stylesheet">`, `<style>`, `<script type="module" src>` (bundled), and classic `<script src>` (copied) resolve against the file and are emitted where written. External and root-relative URLs and inline scripts stay literal. Images and fonts go in `src/public/` with root-relative URLs.
- No props, data hooks, Layout, `[param]` filenames, or SSR of custom elements; use `eco.page()` for those. `404.html` and `500.html` work as error pages. Two files for one route (`about.html` and `about.tsx`) is an error.
- `html.html` cannot render `metadata`, so `eco.page()` Pages under it keep its static `<title>` and description. Mixed apps whose `eco.page()` Pages set metadata should keep a JSX or React `html.*`; HTML Pages work inside it too.

## Components and dependency discovery

In files declaring `eco.component()`, `eco.layout()`, `eco.html()`, or `eco.page()`, as well as MDX documents compiled through `@ecopages/mdx/core`, Ecopages automatically discovers:

- **Child Components:** Direct imports of local `eco.component()` exports (relative, tsconfig aliases, and named `export { X } from` barrels) contribute dependencies transitively.
- **CSS Stylesheets:** Direct side-effect CSS imports (`import './counter.css'` or `import '@/styles/main.css'`) are extracted into the asset pipeline and stripped from server/browser modules. They are not copied into `config.dependencies.stylesheets`; explicit entries override the same resolved file.
- **MDX Support:** In MDX files, top-level component and CSS imports are discovered while markdown code blocks and dynamic imports within functions are safely ignored. Combine a catch-all Page's relative assets with `mergePageDependencies(pageAssets, await getEntryDependencies(slug))`.

**Best practice:** Author **one `eco.component()` per file**. Co-locating multiple declared components in a single file will cause all components in that file to share discovered dependencies.

**What remains explicit:**

- **Browser scripts:** Declare in `dependencies.scripts`. Use `{ src, ssr: true }` when the script registers a custom element that must SSR (Lit and Ecopages JSX Radiant hosts). `lazy` controls browser timing only.
- **`export *` barrels & packages:** `export * from ...` and external packages are not followed. Use explicit `dependencies.components` for these. Named `export { Counter } from './counter'` barrels are discovered.

```tsx
import { eco } from '@ecopages/core';
import { Counter } from './counter';
import './my-component.css';

export const MyComponent = eco.component({
	dependencies: {
		// scripts remain explicit; Counter and my-component.css are discovered automatically
		scripts: [{ src: './my-component.script.ts', ssr: true, lazy: { 'on:visible': true } }],
	},
	render: ({ title }) => (
		<div>
			<h2>{title}</h2>
			<Counter />
		</div>
	),
});
```

## Metadata and SEO

Defaults in `eco.config.ts` via `defaultMetadata`. Page metadata merges automatically and flows to `html.tsx` → `Head` → `Seo`.

```tsx
export default eco.page({
	metadata: () => ({
		title: 'My Page',
		description: 'Page description',
	}),
	render: () => <div>Content</div>,
});
```

### Sitemap (opt in)

Disabled by default. Enable in `eco.config.ts`:

```typescript
export default defineConfig({
	sitemap: {
		enabled: true,
		extraUrls: ['/rss.xml'],
		exclude: ['/admin/**'],
	},
});
```

Included URLs: successfully exported static pages whose metadata resolves and `robots.index !== false`. Omitted when metadata throws (fail-closed) or `cache: 'dynamic'`. `exclude` filters eligible pathnames; `extraUrls` always append (not filtered by exclude or page robots). Written after `afterStaticExport` during `ecopages build` only — not served by `ecopages dev`. Requires correct `baseUrl` / `ECOPAGES_BASE_URL` at build time. Output is sitemap.org 0.9 `<loc>` only (no `lastmod`). Full rules: `/docs/core/sitemap`.

## Common patterns

**Dynamic routes:** `src/pages/blog/[slug].tsx` with `staticProps` reading `pathname.params`.

**Data fetching:** Prefer direct function calls in `staticPaths` / `staticProps` over HTTP to your own API during static generation.

## Best practices

1. Use `eco.page()` for routable pages
2. Author one `eco.component()` per file for clear auto-discovered dependency boundaries
3. Declare browser scripts, `export *` barrels, and external package dependencies explicitly in `dependencies`
4. Organize by feature
5. Use CSS variables with Tailwind v4 `@theme`
6. Match MDX to the owning integration plugin
