# @ecopages/content-processor

Build-time content collections for Ecopages. Scans MDX (or other configured extensions) at build time, validates frontmatter, and exposes each collection as a typed virtual module: `ecopages:content/<collection>`.

## Mental model

1. **Declare collections** in `eco.config.ts` — content directory, frontmatter schema, and sort order.
2. **Scan at build time** — the processor validates frontmatter and writes generated modules under `.eco/cache/`.
3. **Import the virtual module** — pages and layouts use `ecopages:content/<collection>` for `entries`, metadata, and MDX components.
4. **Own your frontmatter** — define fields with any [Standard Schema](https://standardschema.dev)-compatible library (Zod, Valibot, ArkType, etc.). The processor adds `slug` and `segments` from the file path.

### What this package owns vs. what your app owns

| Layer | Owned by |
| :---- | :------- |
| File discovery, frontmatter validation, manifest sort | `@ecopages/content-processor` |
| Generated `ecopages:content/*` modules (`entries`, `getComponent`, …) | `@ecopages/content-processor` |
| `ContentScanner` for build scripts (for example `llms.txt`) | `@ecopages/content-processor` |
| Routes (`eco.page`), layouts, metadata, URL shape | Your app |
| Sidebar, breadcrumbs, pagination | Your app — derive from `entries` and frontmatter fields such as `title`, `group`, and `order` |

The processor gives you a typed manifest and MDX components at build time. Wire them into Ecopages routing and UI the same way you would any other data source.

## Features

- **Build-time scanning** — content metadata and MDX imports are resolved before page bundles ship.
- **Standard Schema validation** — frontmatter schemas stay in your app; the library validates through the Standard Schema interface.
- **Typed virtual modules** — `ecopages:content/<collection>` with generated `Entry` types.
- **Multiple collections** — docs, blog, changelog, or any keyed collection you configure.
- **`ContentScanner`** — reuse the same scan logic in one-off build scripts (for example, `llms.txt` generation).

## Installation

```bash
bun add @ecopages/content-processor
```

Peer dependency: `@ecopages/core`.

## Configuration

Register the processor in `eco.config.ts`:

```typescript
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { compareEntriesByField } from '@ecopages/content-processor';
import { docsFrontmatterSchema } from './src/content/docs-schema';

export default await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setProcessors([
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
	])
	.build();
```

### Collection options

| Option       | Required | Description                                                                                                                                          |
| :----------- | :------: | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentDir` |   yes    | Directory relative to app `srcDir`, e.g. `content/docs`.                                                                                             |
| `schema`     |   yes    | Standard Schema validator for frontmatter.                                                                                                           |
| `entryType`  |    no    | Frontmatter type for generated virtual-module types. Format: `./path/to/schema#TypeName`. The processor wraps it as `ContentEntry<YourFrontmatter>`. |
| `orderBy`    |    no    | Comparator function for manifest sort. Default: {@link compareEntriesBySlug}. Use {@link compareEntriesByField} for frontmatter fields.              |
| `extensions` |    no    | File extensions to scan. Default: `['.mdx']`.                                                                                                        |

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

Virtual-module types are generated at build/dev time into:

```text
node_modules/@types/ecopages-content-processor/virtual-module.d.ts
```

Add a root `modules.d.ts` (same pattern as `@ecopages/image-processor`):

```typescript
/// <reference types="ecopages-content-processor" />

import '@ecopages/core/declarations';
import '@ecopages/content-processor/types';
```

Recommended `tsconfig.json` additions:

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"types": ["bun", "ecopages-content-processor"]
	},
	"include": ["src", "eco.config.ts", "modules.d.ts", "node_modules/@types/ecopages-content-processor"]
}
```

Run `ecopages dev` or `ecopages build` before expecting IDE types. Restart the TypeScript server if types look stale after changing schema or collection config.

## Virtual module API

Each collection exposes `ecopages:content/<collection>`:

```typescript
import { entries, getEntry, getEntryBySegments, getComponent } from 'ecopages:content/docs';
import type { Entry } from 'ecopages:content/docs';
```

| Export                         | Description                                                                                     |
| :----------------------------- | :---------------------------------------------------------------------------------------------- |
| `entries`                      | Readonly manifest of all entries, sorted by `orderBy`.                                          |
| `getEntry(slug)`               | Lookup by joined slug, e.g. `'getting-started/intro'`.                                          |
| `getEntryBySegments(segments)` | Lookup by segment array, e.g. `['getting-started', 'intro']`.                                   |
| `getComponent(slug)`           | MDX component for the entry.                                                                    |
| `Entry`                        | **Type only.** `ContentEntry<YourFrontmatter>` — frontmatter fields plus `slug` and `segments`. |

**Important:** `Entry` exists only in generated `.d.ts` files, not in the runtime cache module. Keep type imports on a separate `import type` line in page files that get bundled. Mixed imports like `import { entries, type Entry }` can cause the bundler to treat `Entry` as a runtime export and fail with `MISSING_EXPORT`.

## Page usage

Define a catch-all or per-entry route with `eco.page`. Import the collection manifest and MDX components from the virtual module:

```typescript
import { eco } from '@ecopages/core';
import { entries, getComponent, getEntryBySegments } from 'ecopages:content/docs';
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
	metadata: ({ props: { entry } }) => ({
		title: entry.title,
		description: entry.description,
	}),
	render: async ({ entry }) => {
		const Content = getComponent(entry.slug);
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

Group or sort in your app — for example by a `group` frontmatter field and an `order` number. See `apps/docs` (`src/lib/content-nav.ts`) and `examples/docs-starter` (`src/content-nav.ts`) for full layouts with sections and sidebars.

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
| `@ecopages/content-processor`        | `ContentScanner`, sort helpers, shared types.                   |
| `@ecopages/content-processor/plugin` | `contentProcessorPlugin()` for `eco.config.ts`.               |
| `@ecopages/content-processor/types`  | `ContentEntry`, `ContentCollectionModule`, `EntryComparator`. |
| `@ecopages/content-processor/mdx`    | `remarkFrontmatter`, `withContentMdxPlugins()`.               |

## Generated artifacts

| Path                                                                 | Purpose                                                |
| :------------------------------------------------------------------- | :----------------------------------------------------- |
| `.eco/cache/ecopages-content-processor/<collection>.ts`              | Generated collection module (manifest + MDX imports).  |
| `node_modules/@types/ecopages-content-processor/virtual-module.d.ts` | Generated TypeScript declarations for virtual modules. |

Do not edit generated files manually.

## Validation errors

Invalid frontmatter throws `SchemaError` from `@standard-schema/utils` during scan/build. Fix the MDX frontmatter or relax the schema in your app.

## MDX integration

Content files are MDX components. Ensure your JSX/MDX integration (for example, `@ecopages/ecopages-jsx`) is configured in `eco.config.ts` so `getComponent()` returns a renderable component.

Content collections with YAML frontmatter need `remark-frontmatter` in the **MDX compile pipeline**. The processor validates frontmatter at scan time (`vfile-matter`); MDX render time needs the remark plugin so `---` blocks are not emitted as content.

Use `@ecopages/content-processor/mdx`:

```typescript
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';

ecopagesJsxPlugin({
	mdx: {
		enabled: true,
		...withContentMdxPlugins({
			remarkPlugins: [remarkGfm],
			rehypePlugins: [/* app-specific rehype plugins */],
		}),
	},
});
```

`withContentMdxPlugins()` prepends `remarkFrontmatter`. Import it directly when you need finer control:

```typescript
import { remarkFrontmatter } from '@ecopages/content-processor/mdx';
```

App-specific presentation plugins (syntax highlighting, GFM, table wrappers) stay in your app — for example `src/mdx/plugins.ts`.
