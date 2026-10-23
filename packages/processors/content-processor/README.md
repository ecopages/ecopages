# @ecopages/content-processor

Build-time content collections for Ecopages. Scans MDX (or other configured extensions) at build time, validates frontmatter, and exposes each collection as a typed virtual module: `ecopages:content/<collection>`.

## Mental model

Build contributions use one `plugins(app)` method. Collection modules and types are generated in `setup()`, and a build that resolves a collection first waits for the same generation. The server resolver and browser resolver declare separate environments, so browser compilation cannot select the server implementation by registration order.

1. **Declare collections** in `eco.config.ts` — content directory, frontmatter schema, and sort order.
2. **Scan at build time** — the processor validates frontmatter and writes generated modules under `.eco/cache/`.
3. **Import the virtual module** — pages and layouts use `ecopages:content/<collection>` for `entries`, metadata, and MDX components.
4. **Own your frontmatter** — define fields with any [Standard Schema](https://standardschema.dev)-compatible library (Zod, Valibot, ArkType, etc.). The processor adds `slug` and `segments` from the file path.

### What this package owns vs. what your app owns

| Layer                                                                 | Owned by                                                                                      |
| :-------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| File discovery, frontmatter validation, manifest sort                 | `@ecopages/content-processor`                                                                 |
| Generated `ecopages:content/*` modules (`entries`, `getComponent`, …) | `@ecopages/content-processor`                                                                 |
| `ContentScanner` for app scripts that emit `llms.txt`                 | `@ecopages/content-processor`                                                                 |
| Routes (`eco.page`), layouts, metadata, URL shape                     | Your app                                                                                      |
| Sidebar, breadcrumbs, pagination                                      | Your app — derive from `entries` and frontmatter fields such as `title`, `group`, and `order` |

The processor gives you a typed manifest and MDX components at build time. Wire them into Ecopages routing and UI the same way you would any other data source.

## Features

- **Build-time scanning** — content metadata is resolved before page bundles ship; MDX entry modules load on demand per slug on the server.
- **Standard Schema validation** — frontmatter schemas stay in your app; the library validates through the Standard Schema interface.
- **Typed virtual modules** — `ecopages:content/<collection>` with generated `Entry` types.
- **Multiple collections** — docs, blog, changelog, or any keyed collection you configure.
- **`ContentScanner`** — reuse the same scan/validate path in one-off build scripts. The scanner does not write `llms.txt`; the app script does.

During development, edits to an entry's MDX body invalidate its compiled server collection bundle even when its frontmatter and generated manifest are unchanged. The next request rebuilds that bundle and renders the new body.

The content processor owns the compiled collection artifacts and their invalidation generation. Core provides the shared server-module build path; collection identity, source tracking, and cache lifetime stay with the content processor.

Co-located non-entry files inside a collection directory (for example `survey-form.config.ts`, helper modules, or JSON data) also invalidate the compiled server collection without rewriting the generated entries manifest.

## Installation

```bash
bun add @ecopages/content-processor
```

Peer dependency: `@ecopages/core`.

## Configuration

Register the processor in `eco.config.ts`:

```typescript
import { defineConfig } from '@ecopages/core/config';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { compareEntriesByField } from '@ecopages/content-processor';
import { blogFrontmatterSchema } from './src/content/blog-schema';
import { docsFrontmatterSchema } from './src/content/docs-schema';

export default defineConfig({
	processors: [
		contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						orderBy: compareEntriesByField('order'),
						schema: docsFrontmatterSchema,
						entryType: './src/content/docs-schema#DocsFrontmatter',
					},
					blog: {
						contentDir: 'content/blog',
						orderBy: compareEntriesByField('title'),
						schema: blogFrontmatterSchema,
						entryType: './src/content/blog-schema#BlogFrontmatter',
						extensions: ['.mdx', '.md'],
					},
				},
			},
		}),
	],
});
```

### Collection options

| Option        | Required | Description                                                                                                                                                                                    |
| :------------ | :------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentDir`  |   yes    | Directory relative to app `srcDir`, e.g. `content/docs`.                                                                                                                                       |
| `schema`      |   yes    | Standard Schema validator for frontmatter.                                                                                                                                                     |
| `entryType`   |    no    | Frontmatter type for generated virtual-module types. Format: `./path/to/schema#TypeName`. The processor wraps it as `ContentEntry<YourFrontmatter>`.                                           |
| `orderBy`     |    no    | Comparator function for manifest sort. Default: {@link compareEntriesBySlug}. Use {@link compareEntriesByField} for frontmatter fields.                                                        |
| `extensions`  |    no    | File extensions to scan. Default: `['.mdx']`. Multi-dot extensions (`.radiant.mdx`, `.react.mdx`) are matched longest-first; declaration order does not matter.                                |
| `routePrefix` |    no    | Public URL prefix for entries, e.g. `/docs`. Used with `devPrewarm`.                                                                                                                           |
| `devPrewarm`  |    no    | Dev prewarm: `'first'`, `'all'`, `{ slugs }`, or `{ limit }`. Core SSR-prewarms after the HMR-ready pipeline exists; prewarm schedules renders only and does not control HTML cache admission. |

Collection keys must be kebab-case (`docs`, `api-reference`). Each key becomes `ecopages:content/<key>`.

## Frontmatter schema (app-owned)

Define schema and frontmatter types in your app. Zod 4 is a common choice:

```typescript
// src/content/docs-schema.ts
import { z } from 'zod';

export const docsFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	group: z.string().optional(),
	order: z.coerce.number().optional(),
});

export type DocsFrontmatter = z.infer<typeof docsFrontmatterSchema>;
```

**Important:** Do not add `slug` or `segments` to your schema. The processor derives them from the file path and exposes them through `ContentEntry<T>`:

```typescript
import type { ContentEntry } from '@ecopages/content-processor';

type DocsEntry = ContentEntry<DocsFrontmatter>;
// DocsEntry includes: title, description, group?, order?, slug, segments
```

Point `entryType` at the **frontmatter type** (`DocsFrontmatter`), not a hand-rolled entry type.

## TypeScript setup

Add one import to the app `modules.d.ts`:

```typescript
import '@ecopages/content-processor/types';
```

That makes `ecopages:content/*`, `/server`, and `/component` imports resolvable immediately.
Collection-specific declarations are generated at dev/build time into
`node_modules/@types/ecopages-content-processor`, which TypeScript loads automatically.

Run `ecopages dev` or `ecopages build` before expecting precise collection entry types. Restart the TypeScript server if generated types look stale after changing schema or collection config.

## Virtual module API

Each collection exposes `ecopages:content/<collection>` for metadata, `ecopages:content/<collection>/server` for server-only dependency discovery, and `ecopages:content/<collection>/component` for a lazy MDX component loader that works on the server and in the browser:

```typescript
import { entries, getEntry, getEntryBySegments } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
import { loadComponent } from 'ecopages:content/docs/component';
import type { Entry } from 'ecopages:content/docs';
```

| Export                         | Module    | Description                                                                                                                                                                                                                                                                                                                                                       |
| :----------------------------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entries`                      | entries   | Readonly manifest of all entries, sorted by `orderBy`.                                                                                                                                                                                                                                                                                                            |
| `getEntry(slug)`               | entries   | Lookup by joined slug, e.g. `'getting-started/intro'`. Throws `HttpError.NotFound` when missing.                                                                                                                                                                                                                                                                  |
| `getEntryBySegments(segments)` | entries   | Lookup by segment array, e.g. `['getting-started', 'intro']`. Throws `HttpError.NotFound` when missing.                                                                                                                                                                                                                                                           |
| `getComponent(slug)`           | server    | `Promise` of the MDX component for the entry (lazy-loaded per slug). Rejects with `HttpError.NotFound` when missing.                                                                                                                                                                                                                                              |
| `getEntryDependencies(slug)`   | server    | Returns `{ components: [entry] }` so collection walks MDX identity. Does not copy the dependency bag. Throws `HttpError.NotFound` when missing.                                                                                                                                                                                                                   |
| `loadComponent(slug)`          | component | `Promise` of the MDX component for the entry. Server graph: the entry wrapped for cross-Integration rendering. Page Browser Graph: the browser-compiled entry. Rejects with `HttpError.NotFound` when missing. Pair with `createLazyCollectionComponents()` from `@ecopages/react/lazy-collection-components` when a hydratable React Page renders the component. |
| `Entry`                        | entries   | **Type only.** `ContentEntry<YourFrontmatter>` — frontmatter fields plus `slug` and `segments`.                                                                                                                                                                                                                                                                   |

`/component` is one specifier with two resolutions. The server graph backs it with the same server module as `/server`, so a Page that imports it shares one component per slug with `getComponent()`. Use it in Pages that also load the entry in the browser, such as a hydratable React Page. `/component` does no asset discovery: a Page that needs the entry's own assets still returns `getEntryDependencies()` from `/server`. The Page Browser Graph backs it with the browser loader and still rejects `/server`, so importing `/component` never makes server code browser-reachable.

**Important:** `Entry` exists only in generated `.d.ts` files, not in the runtime cache module. Keep type imports on a separate `import type` line in page files that get bundled. Mixed imports like `import { entries, type Entry }` can cause the bundler to treat `Entry` as a runtime export and fail with `MISSING_EXPORT`.

## Page usage

Define a catch-all or per-entry route with `eco.page`. Import the collection manifest and MDX components from the virtual module:

```typescript
import { eco } from '@ecopages/core';
import { entries, getEntryBySegments } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
import type { Entry } from 'ecopages:content/docs';

export default eco.page<{ entry: Entry }>({
	staticPaths: async () => ({
		paths: entries.map((post) => ({
			params: { slug: post.segments },
		})),
	}),
	staticProps: async ({ pathname }) => {
		const segments = Array.isArray(pathname.params.slug)
			? pathname.params.slug
			: [pathname.params.slug];

		return {
			props: { entry: getEntryBySegments(segments) },
		};
	},
	dependencies: async ({ props }) => getEntryDependencies(props.entry.slug),
	metadata: ({ props: { entry } }) => ({
		title: entry.title,
		description: entry.description,
	}),
	render: async ({ entry }) => {
		const Content = await getComponent(entry.slug);
		return <Content />;
	},
});
```

Return `getEntryDependencies` alone when the Page has no relative assets of its own. Combine Page-local `scripts`, `stylesheets`, or `modules` with `mergePageDependencies()` so each file keeps ownership.

### Hydratable React Pages

When a React Page must keep the MDX component in its hydrated tree, create one lazy component per slug from the `/component` loader and render it inside a `<Suspense>` boundary. The server waits for the entry and sends it in the HTML; hydration keeps that HTML until the browser has loaded the entry. `getEntryDependencies()` remains server-only and is stripped from the Page Browser Graph. In development, HMR of the Page module keeps the already-loaded entry on screen. An edited MDX file still updates without a document reload.

```tsx
import { Suspense } from 'react';
import { createLazyCollectionComponents } from '@ecopages/react/lazy-collection-components';
import { getEntry } from 'ecopages:content/docs';
import { loadComponent } from 'ecopages:content/docs/component';
import { getEntryDependencies } from 'ecopages:content/docs/server';

const docs = createLazyCollectionComponents(loadComponent);

export default eco.page({
	staticProps: async ({ pathname }) => ({ props: { entry: getEntry(pathname.params.slug) } }),
	dependencies: ({ props }) => getEntryDependencies(props.entry.slug),
	render: ({ entry }) => {
		const Content = docs.get(entry.slug);
		return (
			<Suspense fallback={null}>
				<Content />
			</Suspense>
		);
	},
});
```

Keep the boundary at a fixed place in the Page. During client navigation between entries, React keeps the current entry on screen until the next one has loaded, as long as the boundary is not remounted for each slug.

Unknown slugs throw `HttpError.NotFound`, so a catch-all that matches `/docs/[...slug]` still serves the app 404 page instead of a 500.

Content MDX entries may import interactive demos and styles without a handwritten `config.dependencies` bag. The MDX loader discovers them:

```mdx
import { WeatherApp } from '@/components/weather-app/weather-app';
import './weather-app.css';

# Weather app

<WeatherApp />
```

`getComponent()` lazy-loads one MDX module per slug and returns the default component with loader-attributed `config` attached. Pair that with `getEntryDependencies()` on the catch-all page so only the active entry contributes to the Page Browser Graph.

`getEntryDependencies(slug)` returns `{ components: [entry] }`. It does not copy `config.dependencies` and does not set `ownerFile`. Relative `scripts`, `stylesheets`, and `modules` declared on the MDX module resolve from that Component's identity rather than the catch-all route.

Combine Page-local relative assets with `mergePageDependencies()`. Object-spread of the two bags copies `ownerFile` onto the other side's relative paths:

```typescript
import { eco, mergePageDependencies } from '@ecopages/core';
import { getComponent, getEntryDependencies } from 'ecopages:content/posts/server';

export default eco.page({
	dependencies: async ({ props }) =>
		mergePageDependencies({ stylesheets: ['./post.css'] }, await getEntryDependencies(props.slug)),
	render: async ({ slug }) => {
		const Content = await getComponent(slug);
		return <Content />;
	},
});
```

## Navigation (app-side)

Navigation is app code. Map `entries` to links using the frontmatter and path fields the processor already validated:

```typescript
import { entries } from 'ecopages:content/docs';

export const docsNav = entries.map((entry) => ({
	title: entry.title,
	href: `/docs/${entry.segments.join('/')}`,
}));
```

Group or sort in your app — for example by a `group` frontmatter field and an `order` number. See `apps/docs` (`src/lib/content-nav.ts`) and `templates/docs-starter` (`src/content-nav.ts`) for full layouts with sections and sidebars.

## Build scripts

Use `ContentScanner` when a script needs the manifest outside page bundles:

```typescript
import { join } from 'node:path';
import { ContentScanner, compareEntriesByField } from '@ecopages/content-processor';
import { docsFrontmatterSchema } from '../src/content/docs-schema';

const scanner = new ContentScanner({
	contentRoot: join(srcDir, 'content/docs'),
	orderBy: compareEntriesByField('order'),
	schema: docsFrontmatterSchema,
});

const manifest = await scanner.getManifest();
const raw = await scanner.getRawContent('getting-started/intro');
```

## Package exports

| Import                               | Purpose                                                       |
| :----------------------------------- | :------------------------------------------------------------ |
| `@ecopages/content-processor`        | `ContentScanner`, sort helpers, shared types.                 |
| `@ecopages/content-processor/plugin` | `contentProcessorPlugin()` for `eco.config.ts`.               |
| `@ecopages/content-processor/types`  | `ContentEntry`, `ContentCollectionModule`, `EntryComparator`. |
| `@ecopages/content-processor/mdx`    | `remarkFrontmatter`, `withContentMdxPlugins()`.               |

## Generated artifacts

| Path                                                                 | Purpose                                                                                                                  |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `.eco/cache/ecopages-content-processor/<collection>.ts`              | Generated collection module (manifest + MDX imports).                                                                    |
| `.eco/cache/ecopages-content-processor/<collection>.browser.ts`      | Browser-safe MDX loaders behind `/component` in the Page Browser Graph. Relative imports resolve from this file on disk. |
| `.eco/.server-collections/<collection>/<collection>-<identity>.mjs`  | Lazy-built server artifact for one collection.                                                                           |
| `node_modules/@types/ecopages-content-processor/virtual-module.d.ts` | Generated TypeScript declarations for virtual modules.                                                                   |

Do not edit generated files manually.

## Validation errors

Invalid frontmatter throws `SchemaError` from `@standard-schema/utils` during scan/build. Fix the MDX frontmatter or relax the schema in your app. In development the error appears in the browser overlay, and saving the fixed file recovers the collection without restarting the server.

## Dev / HMR

In development, the processor watches collection files to regenerate `ecopages:content/*` manifests when MDX changes. The generated server artifact is built lazily on the first server import and reused by its content-derived identity; MDX edits invalidate that artifact before the next Page build. Collection MDX is still server source: Ecopages invalidates server modules and runs HMR so page imports pick up the updated MDX component.

Watch config drives manifest regeneration only. Asset ownership (which would skip server invalidation) requires declared processor capabilities. Content-processor does not claim MDX as an asset, so no `capabilities` workaround is needed in `eco.config.ts`.

## MDX integration

Content files are MDX components. Ensure your JSX or React integration is configured in `eco.config.ts` with an `mdx` option so collection entries compile as components.

Content collections with YAML frontmatter need `remark-frontmatter` in the **MDX compile pipeline**. The processor validates frontmatter at scan time (`vfile-matter`); MDX render time needs the remark plugin so `---` blocks are not emitted as content.

Use `@ecopages/content-processor/mdx` on whichever integration compiles the MDX:

```typescript
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';

ecopagesJsxPlugin({
	mdx: {
		...withContentMdxPlugins({
			remarkPlugins: [remarkGfm],
			rehypePlugins: [/* app-specific rehype plugins */],
		}),
	},
});

reactPlugin({
	mdx: {
		...withContentMdxPlugins(),
	},
});
```

`withContentMdxPlugins()` prepends `remarkFrontmatter`. Import it directly when you need finer control:

```typescript
import { remarkFrontmatter } from '@ecopages/content-processor/mdx';
```

App-specific presentation plugins (syntax highlighting, GFM, table wrappers) stay in your app — for example `src/mdx/plugins.ts`.

## Content-entry ownership

The integration that compiles an MDX entry also owns its rendering: an entry compiled with `mdx.extensions: ['.react.mdx']` on the React integration is a React component and must be rendered through a React-owned route (for example a `[...slug].react.tsx` catch-all). Calling it from a JSX (Radiant) or Kita render tree cannot serialize its output.

The generated `getComponent()` preserves this ownership at render time: invoking an entry in its owning lane renders directly, while a supported foreign-child render lane queues the entry through its owning integration. If no handoff runtime is available, it throws with the entry path, owning integration, and active integration. When both integrations compile MDX for the same collection, declare disjoint `mdx.extensions` per integration — since the React MDX loader derives its filter from the declared extensions, only `.react.mdx` files compile with React. `mdx.extensions` replaces `compilerOptions.mdxExtensions` rather than merging with it.
