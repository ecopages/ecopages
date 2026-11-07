# `eco` Namespace

**Layer:** Contracts.

A unified API for defining components, pages, and page data in EcoPages.

## Overview

The `eco` namespace provides a consistent, type-safe interface for:

1. **`eco.component()`** - Factory for defining reusable components with dependencies and optional lazy-loading
2. **`eco.html()`** - Semantic alias for the document shell component (the outermost HTML wrapper)
3. **`eco.layout()`** - Semantic alias for route layout components (page-level wrappers)
4. **`eco.page()`** - Factory for defining page components with optional inline `staticPaths`, `staticProps`, and `metadata`

## Layout assignment

Layouts are assigned explicitly on each `eco.page({ layout })` call — either one layout component or an outer→inner array. `layout` takes an `eco.layout()` result or a plain function typed with `LayoutProps` (its `children` are required), and an entry `{ component, props }` adds a props factory to either. EcoPages normalizes the stack at factory time to `config.layouts` and `config.layoutEntries`, and merges only `eco.layout()` results into `dependencies.components`: a plain layout is composed, not a declared dependency, and its imports reach the page through discovery. Layout composition reports a layout that did not render its `children` (`LayoutChildrenNotRenderedError`): static build output fails, a development request-time render warns, and a production request-time render returns the HTML unchanged.

EcoPages does **not** infer layouts from `src/layouts/` file paths or route segment directories. A file under `src/layouts/` is only used when a page imports it and passes it to `layout`.

## Dependency discovery

Discovery is enabled by default for modules declaring `eco.component()`, `eco.layout()`, `eco.html()`, or `eco.page()`, as well as MDX documents compiled through `@ecopages/mdx/core`. From there it also walks the plain local modules those declarations import, so a plain function can import its own CSS.

Wrap a component in `eco.component()` only when it needs browser scripts, `modules`, stylesheet attributes, an `integration` override, or rendering by another Integration. A layout uses `eco.layout()` only for those needs, and the document shell uses `eco.html()`. Everything else, layouts included, can be a plain function.

```tsx
import { eco } from '@ecopages/core';
import { Counter } from './counter';
import './page.css';

export default eco.page({
	render: () => <Counter />,
});
```

Direct static named/default imports of local Eco Components contribute their Dependencies transitively. A static named, default or side-effect import of a plain local module is walked too: its side-effect CSS reaches the nearest declaration that imports it, and the Eco Components it imports become Components of that declaration. The walk stops at Eco modules, packages and `.server` modules. Configured TypeScript path aliases and relative imports are supported for both Components and CSS stylesheets (e.g., `import '@/components/button'` or `import '@/styles/main.css'`). Side-effect CSS imports become stylesheet Dependencies; the shared transform removes the imports so the existing asset pipeline owns delivery in server and browser builds. In MDX documents, top-level component and CSS imports are discovered while markdown code blocks and dynamic imports within functions are safely ignored.

Discovery is conservative and module-scoped: every Eco declaration in a file shares its imported Components and styles, even when a render condition omits a Component. It does not infer which Components actually render. **Best practice:** author **one `eco.component()` per file**. Co-locating multiple components in a single file will cause all declared components in that file to share discovered dependencies.

Imported Layouts contribute assets; only the explicit `layout` option controls Layout composition.

Explicit `dependencies` remain supported. Explicit Components come first, followed by discovered Components in import order, with duplicate Components removed. Explicit stylesheet declarations take precedence over discovered references to the same resolved file, preserving their attributes and order. Discovered stylesheets are **not** written into `config.dependencies.stylesheets`; they stay on Component identity until collection. Inferred styles follow explicit styles and are emitted once per collection; a declaration's own CSS precedes the CSS of the plain modules it imports, and a stylesheet that only plain modules import, reached from several declarations on the Page, takes the position of its last occurrence, so it follows the CSS of every declaration importing it. A plain component's CSS under a persisted Layout therefore stays with that Layout. Circular dependency traversal is guarded by Component config identity, so two Components in one file remain distinct.

When a Page combines its own relative assets with a content entry, use `mergePageDependencies()`. Do not object-spread the two bags: spread copies `ownerFile` onto the other side's relative paths.

```ts
import { eco, mergePageDependencies } from '@ecopages/core';
import { getEntryDependencies } from 'ecopages:content/posts/server';

export default eco.page({
	dependencies: async ({ props }) =>
		mergePageDependencies({ stylesheets: ['./post.css'] }, await getEntryDependencies(props.slug)),
	render: () => <article />,
});
```

Browser scripts remain explicit:

```ts
scripts: [
	{
		src: './counter.script.ts',
		ssr: true,
		lazy: { 'on:visible': true },
	},
];
```

For Lit and Ecopages JSX (Radiant hosts), `ssr: true` imports the script on the server before rendering so `customElements.define` runs without a separate value import in the component file. `lazy` controls browser delivery only; it does not suppress server import. To load eagerly in the browser, omit `lazy`. String-form `scripts: ['./file.ts']` stays browser-only unless you opt in with `{ src, ssr: true }`.

Scripts listening to client navigation events (`eco:after-swap`, `eco:page-load`) should be registered as client scripts (e.g., using `scripts: ['./component.script.ts']`) or guarded by `isServer` from `@ecopages/radiant/is-server` when used in Radiant projects where `document` is defined during SSR.

Named barrel re-exports (`export { Counter } from './counter'`) are followed for the imported binding only. The imported module, the factory file, and successful named re-export hops are watch paths, so editing a child Component or retargeting a barrel updates page assets without editing the importing Page. Discovery does not follow `export * from './components'`, dynamic imports, namespace imports (`import * as`), package Components, or custom import attributes. `export *` would pull an entire kit into the page asset graph; keep that explicit with `dependencies.components`; a development render fails for a component the route never declared. Ordinary utility imports do not become browser script entries. Missing supported imports report the owner file and import specifier.

Plain modules are walked too, and they are watch paths, so adding or removing a CSS import in a plain component refreshes the Page's stylesheets in development. The build removes their side-effect CSS imports, so server, browser, development and production builds treat them alike. These CSS imports fail the build in development and in `ecopages build`, naming the file and the import. Modules outside the app root, such as linked workspace packages, count as packages and are not checked, and a CSS Module only fails in a module an Integration owns or discovery reaches:

- a side-effect CSS import in a plain module that no declaration reaches (for example one imported only through `export *`, a namespace import, or a client script);
- a CSS Module (`./card.module.css`), local or from a package.

A side-effect import of a package stylesheet (`import 'some-lib/style.css'`, or `import 'swiper/css'` when the package resolves it to a `.css` file) is discovered like local CSS. It is linked once on the Page, skips the app's Processors, and has the files its relative `url()` references emitted under content hashes. A specifier ending in `.css` resolves with the `style` export condition first; any other specifier counts only when it resolves to a `.css` file without it, so a package whose entry is a script stays a script import. Discovery writes each one as the folder of the module that imports it, relative to the app root, and its package path, the package name, version and path inside the package (`src/components|some-lib@1.2.0/css/style.css`), and marks it in `packageStylesheets`; local stylesheets and watch files are written relative to the app root. `resolveDiscoveredStylesheets(config, rootDir)` resolves the package path from that folder at load, as Node resolves it, so a moved build, another store layout or a linked workspace package's own dependency still reaches the file, and two versions of one package stay two files. Collection turns these into assets whose `fromPackage` is the package path, which is also their dependency key. One under `node_modules` is not a watch path.

A plain component does not cross Integrations. When a module renders a plain component that another Integration owns and the two compile JSX with different runtimes (a `@jsxImportSource` pragma wins), the build fails, names the component and both Integrations, and suggests `eco.component()`, which hands it over as a Foreign Child. Lit, which leaves the runtime to the app's tsconfig, and MDX are not checked.

## Component ownership

The effective Integration owner follows one precedence rule everywhere: `config.integration`, then the build-time `config.identity.integration`, then the containing component's owner. A component-level override therefore controls both server rendering and its Page Client Plan even when the file belongs to another Integration. Components without either declaration inherit their parent's owner.

Component factories read their active render context from `eco/`. The route renderer opens that context for each render and supplies the foreign-child runtime used to hand off components owned by another Integration. Nested and overlapping renders keep their own context across asynchronous work.

## Component Patterns

EcoPages supports two approaches for creating components, each suited for different use cases:

### Simple JSX Functions (Static Components)

For purely presentational components without client-side interactivity, use plain JSX functions. This pattern works best with utility-first CSS frameworks like Tailwind, where styles are applied via class names:

```tsx
import type { PropsWithChildren } from '@kitajs/html';
import { cn } from 'your-library';

type CardProps = PropsWithChildren<{
	class?: string;
}>;

export function Card({ children, class: className }: CardProps) {
	return <div class={cn('p-6 rounded-2xl border border-white/10 bg-zinc-900/30', className)}>{children}</div>;
}
```

**When to use:**

- Static/presentational UI (cards, alerts, badges, layout primitives)
- Projects using utility-first CSS (Tailwind, UnoCSS, etc.)
- Components that only render HTML without scripts, or that import their own stylesheet (`import './card.css'`)
- Zero runtime cost - just functions returning markup

> **Note:** A plain function can import its own CSS. Use `eco.component()` only when it needs browser scripts, `modules`, stylesheet attributes, an `integration` override, or rendering by another Integration.

### Plain React Components

React components with hooks and Tailwind CSS work out of the box without `eco.component()`. Standard React components can be used directly:

```tsx
import { useEffect, useState } from 'react';

export function ThemeToggle() {
	const [mounted, setMounted] = useState(false);
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		setMounted(true);
		const theme = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

		if (theme === 'dark' || (!theme && prefersDark)) {
			setIsDark(true);
			document.documentElement.classList.add('dark');
		} else {
			setIsDark(false);
			document.documentElement.classList.remove('dark');
		}
	}, []);

	const toggleTheme = () => {
		const newTheme = !isDark;
		setIsDark(newTheme);

		if (newTheme) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
	};

	if (!mounted) return null;

	return (
		<button
			onClick={toggleTheme}
			className="p-2 rounded-md hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors"
			aria-label="Toggle theme"
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</button>
	);
}
```

**When to use:**

- React components with hooks (`useState`, `useEffect`, etc.)
- Components styled with Tailwind CSS classes or with an imported stylesheet
- Interactive UI that doesn't require external scripts

> **Note:** Use `eco.component()` only when it needs browser scripts, `modules`, stylesheet attributes, an `integration` override, or rendering by another Integration. Plain functions are simpler and sufficient otherwise.

### `eco.component()` (Interactive Components)

For components that need dependencies, scripts, or lazy loading:

```tsx
import { eco } from '@ecopages/core';

export const Counter = eco.component({
	dependencies: {
		stylesheets: ['./counter.css'],
		scripts: [{ src: './counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},
	render: ({ count }) => <my-counter count={count} />,
});
```

**When to use:**

- Components with browser scripts or `modules`
- Stylesheets with attributes (for example `media="print"`)
- Lazy-loaded components with hydration strategies
- Components rendered by another Integration, or with an `integration` override

### Comparison

| Aspect                          | Simple JSX | Plain React    | `eco.component()` |
| ------------------------------- | ---------- | -------------- | ----------------- |
| React hooks                     | No         | Yes            | Yes               |
| Imported stylesheets            | Yes        | Yes            | Yes               |
| Scripts                         | No         | No             | Yes               |
| Rendered by another Integration | No         | No             | Yes               |
| Lazy loading                    | No         | No             | Yes               |
| Hydration strategies            | No         | No             | Yes               |
| Runtime cost                    | Zero       | Minimal        | Minimal           |
| Use case                        | Static UI  | Interactive UI | Advanced UI       |

All patterns can coexist in the same project. Use the right tool for the job.

## React Support

EcoPages fully supports React components. You can use `eco.component()` with React to managing dependencies and hydration while maintaining type safety.

Since React components return `ReactNode` or `JSX.Element` (not `EcoPagesElement`), you need to specify the return type generic:

```tsx
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

type ButtonProps = {
	label: string;
	onClick?: () => void;
};

// Specify ReactNode as the second generic argument
export const Button = eco.component<ButtonProps, ReactNode>({
	dependencies: {
		stylesheets: ['./button.css'],
	},
	render: ({ label, onClick }) => (
		<button className="eco-button" onClick={onClick}>
			{label}
		</button>
	),
});
```

You can also use it for pages:

```tsx
import { eco } from '@ecopages/core';
import type { JSX } from 'react';

export default eco.page<Props, JSX.Element>({
	layout: BaseLayout,
	render: () => <h1>Hello React</h1>,
});
```

## Page data

Define everything in one place:

```tsx
import { eco } from '@ecopages/core';

export default eco.page<BlogPostProps>({
	layout: BaseLayout,
	staticPaths: async () => ({ paths: getAllSlugs() }),
	staticProps: async ({ pathname }) => ({
		props: { post: await getPost(pathname.params.slug) },
	}),
	metadata: ({ props: { post } }) => ({
		title: post.title,
		description: post.excerpt,
	}),
	render: ({ post }) => <article>{post.content}</article>,
});
```

A Page declares its data only through the `staticPaths`, `staticProps` and `metadata` options. A page module that still exports `getStaticPaths`, `getStaticProps` or `getMetadata` fails in `ecopages dev` and `ecopages build` with an error naming the file. The `migrate-to-eco-page` codemod in `@ecopages/codemod` rewrites those pages, including the `eco.staticPaths()`, `eco.staticProps()` and `eco.metadata()` wrappers.

## API Reference

### `eco.html()`

Creates the document shell component — the outermost HTML wrapper rendered once per page. Semantically equivalent to `eco.component()` but signals intent to tooling and readers that this component owns the full document structure (`<html>`, `<head>`, `<body>`).

```tsx
import { eco } from '@ecopages/core';

export const Document = eco.html({
	dependencies: {
		stylesheets: ['./document.css'],
	},
	render: ({ children, metadata }) => (
		<html lang="en">
			<head>
				<title>{metadata?.title ?? 'EcoPages'}</title>
			</head>
			<body>{children}</body>
		</html>
	),
});
```

### `eco.layout()`

Creates a route layout component — a wrapper rendered around page content. Semantically equivalent to `eco.component()` but clearly communicates that the component is intended to be used as a `layout` in `eco.page()`.

```tsx
import { eco } from '@ecopages/core';

export const BaseLayout = eco.layout({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children }) => <main>{children}</main>,
});
```

Use `eco.layout()` components as the `layout` option in `eco.page()`:

```tsx
export default eco.page({
	layout: BaseLayout,
	render: () => <h1>Hello</h1>,
});
```

**Nested layouts (outer → inner):**

```tsx
export default eco.page({
	layout: [MarketingShell, DocsShell],
	render: () => <h1>Hello</h1>,
});
```

A single layout remains equivalent to a one-element array. Normalization stores the stack on `config.layouts` and `config.layoutEntries` at factory time.

### `eco.component()`

Define a reusable component with dependencies.

```tsx
import { eco } from '@ecopages/core';

export const BaseLayout = eco.component({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, class: className }) => (
		<html>
			<body class={className}>{children}</body>
		</html>
	),
});
```

**With lazy-loaded scripts:**

```tsx
export const Counter = eco.component({
	dependencies: {
		stylesheets: ['./counter.css'], // loaded immediately
		scripts: [
			{ src: './counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }, // loaded on trigger
		],
	},
	render: ({ count }) => <my-counter count={count}></my-counter>,
});
```

#### Lazy Loading Options

Lazy loading is configured per dependency entry in `dependencies.scripts`:

```tsx
// Load on idle
scripts: [{ src: './component.script.ts', lazy: { 'on:idle': true } }];

// Load on interaction
scripts: [{ src: './component.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }];

// Load on visibility
scripts: [{ src: './component.script.ts', lazy: { 'on:visible': true } }]; // or viewport margin like '100px'
```

Each entry can define its own trigger, so mixed strategies in one component are supported.

At render time, the component's root element receives a `data-eco-trigger` attribute, and the page carries one
global injector map that tells the [`scripts-injector`](https://github.com/ecopages/scripts-injector) runtime which
scripts to load for each trigger.

### `eco.page()`

Define a page component with optional inline static functions.

**Consolidated API (everything in one place):**

```tsx
type BlogPostProps = { slug: string; title: string; text: string };

export default eco.page<BlogPostProps>({
	layout: BaseLayout,

	// Generate paths for dynamic routes
	staticPaths: async () => ({
		paths: posts.map((p) => ({ params: { slug: p.slug } })),
	}),

	// Fetch data at build time
	staticProps: async ({ pathname }) => ({
		props: {
			slug: pathname.params.slug as string,
			title: post.title,
			text: post.text,
		},
	}),

	// Generate page metadata
	metadata: ({ props: { title, slug } }) => ({
		title: `${title} | My Blog`,
		description: `Read about ${slug}`,
	}),

	// Render the page
	render: ({ title, text }) => (
		<article>
			<h1>{title}</h1>
			<p>{text}</p>
		</article>
	),
});
```

**Simple page without data fetching:**

```tsx
export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Home',
		description: 'Welcome to EcoPages',
	}),
	render: () => <h1>Welcome</h1>,
});
```

**With layout:**

```tsx
export default eco.page({
	layout: BaseLayout, // Wraps render output automatically
	render: () => <h1>Content</h1>,
});
```

## Complete Examples

### Dynamic Blog Post

```tsx
// pages/blog/[slug].tsx
import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { getBlogPost, getAllBlogPostSlugs, getAuthor } from '@/mocks/data';

type BlogPostProps = {
	slug: string;
	title: string;
	text: string;
	authorId: string;
	authorName: string;
};

export default eco.page<BlogPostProps>({
	layout: BaseLayout,

	staticPaths: async () => {
		return { paths: getAllBlogPostSlugs() };
	},

	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const post = getBlogPost(slug);
		if (!post) throw new Error(`Post not found: ${slug}`);
		const author = getAuthor(post.authorId);
		return {
			props: {
				slug,
				title: post.title,
				text: post.text,
				authorId: post.authorId,
				authorName: author?.name ?? 'Unknown',
			},
		};
	},

	metadata: ({ props: { title, slug } }) => ({
		title: `${title} | My Blog`,
		description: `Read the blog post: ${slug}`,
	}),

	render: ({ title, text, authorId, authorName }) => (
		<article>
			<h1>{title}</h1>
			<p>
				By <a href={`/blog/author/${authorId}`}>{authorName}</a>
			</p>
			<div>{text}</div>
		</article>
	),
});
```

### Lazy-Loaded Component

```tsx
// components/counter/counter.tsx
import { eco } from '@ecopages/core';

export const Counter = eco.component({
	dependencies: {
		stylesheets: ['./counter.css'],
		scripts: [{ src: './counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},
	render: ({ count }) => <my-counter count={count} />,
});
```

**HTML Output:**

```html
<my-counter count="5" data-eco-trigger="eco-trigger-1a2b3c">
	<!-- SSR content -->
</my-counter>
```

The page also carries one `<script type="ecopages/global-injector-map">` that maps each `data-eco-trigger` id to its trigger and script URLs.

### Page with Lazy Component

```tsx
// pages/index.tsx
import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { Counter } from '@/components/counter';

export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Home',
		description: 'Welcome to EcoPages',
	}),
	render: () => (
		<>
			<h1>Welcome</h1>
			<Counter count={5} />
		</>
	),
});
```

The static `Counter` import is discovered automatically. You do not list it again in `dependencies.components`. Lazy scripts stay on the Component.

## Type Definitions

```typescript
type LazyTrigger = { 'on:idle': true } | { 'on:interaction': string } | { 'on:visible': true | string };

type DependencyEntry = {
	src?: string;
	content?: string;
	lazy?: LazyTrigger;
	ssr?: boolean;
	attributes?: Record<string, string>;
};

interface EcoComponentDependencies {
	scripts?: Array<string | DependencyEntry>;
	stylesheets?: Array<string | DependencyEntry>;
	modules?: string[];
	/** Declared eco components only — see `EcoComponent`. */
	components?: EcoComponent[];
}

type FileOwnedDependencyContribution = EcoComponentDependencies & {
	ownerFile?: string;
};

type PageDependenciesResult = FileOwnedDependencyContribution & {
	contributions?: FileOwnedDependencyContribution[];
};

type GetPageDependencies<T> = (context: {
	props: PagePropsFor<T>;
	params?: PageParams;
	query?: PageQuery;
}) => PageDependenciesResult | undefined | Promise<PageDependenciesResult | undefined>;

// Shared base option shape used by component(), html(), and layout()
interface ComponentOptions<P, E = EcoPagesElement> {
	componentDir?: string;
	dependencies?: EcoComponentDependencies;
	render: (props: P) => E;
}

// html() and layout() accept the same options as component() but return
// narrower types to signal intent (EcoHtmlComponent / EcoLayoutComponent).
type HtmlOptions<E = EcoPagesElement> = ComponentOptions<HtmlTemplateProps<E>, E>;
type LayoutOptions<E = EcoPagesElement> = ComponentOptions<LayoutProps<E>, E>;

interface PageOptions<T, E = EcoPagesElement> {
	componentDir?: string;
	dependencies?: EcoComponentDependencies | GetPageDependencies<T>;
	layout?: EcoComponent<{ children: E }>;
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;
	render: (props: PagePropsFor<T>) => E;
}

type EcoPageComponent<T> = EcoComponent<PagePropsFor<T>> & {
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;
};

type PagePropsFor<T> =
	T extends GetStaticProps<infer P>
		? P & { params?: PageParams; query?: PageQuery }
		: T & { params?: PageParams; query?: PageQuery };
```

## Benefits

### 1. Discoverability

```tsx
import { eco } from '@ecopages/core';

eco. // IDE shows: component, html, layout, page, metadata, staticPaths, staticProps
```

### 2. Type Safety

Props flow through the system automatically:

```tsx
export default eco.page<{ title: string }>({
	staticProps: async () => ({ props: { title: 'Hello' } }),
	render: ({ title }) => <h1>{title}</h1>, // ✓ TypeScript knows `title` is a string
});
```

### 3. Single Source of Truth

All page configuration in one place - no hunting for separate exports:

```tsx
export default eco.page<Props>({
  layout: BaseLayout,
  staticPaths: async () => ...,
  staticProps: async () => ...,
  metadata: () => ...,
  render: () => ...,
});
```

## Design Decisions

### Why one options object?

| Aspect             | Separate exports      | `eco.page` options |
| ------------------ | --------------------- | ------------------ |
| Discoverability    | Scan file for exports | All in one place   |
| Type inference     | Manual with `typeof`  | Automatic flow     |
| Colocated concerns | Spread across file    | Single object      |

## Implementation Notes

The renderer reads the data hooks from the Page only:

```typescript
const getStaticProps = Page.staticProps;
const getMetadata = Page.metadata;
```

`PageModuleLoaderService.assertNoLegacyPageExports` fails a page module that exports `getStaticProps`, `getStaticPaths` or `getMetadata`, naming the file and the `migrate-to-eco-page` codemod. MDX pages cannot call `eco.page()`, so the MDX integrations move their `getMetadata` export onto the Page as `metadata` through `moveMdxMetadataOntoPage` before core sees the module.

## Migration

Run the `migrate-to-eco-page` codemod from `@ecopages/codemod` on `src/pages`; see its README. It handles `export const` and `export function` forms, `export { x as getX }` lists, the `eco.*` wrappers and pages that already call `eco.page`.

## References

- [scripts-injector](https://github.com/ecopages/scripts-injector) - Custom element for lazy script loading
- [Islands Architecture](https://www.patterns.dev/posts/islands-architecture) - Pattern inspiration
