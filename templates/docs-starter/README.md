# Docs starter template

An Ecopages docs site using `@ecopages/content-processor`, frontmatter-driven MDX, and a catch-all docs route. Chrome uses `@ecopages/radiant-ui` (sidebar, TOC, breadcrumb, cycle theme toggle, alerts).

## Structure

- `src/content/docs/**` — MDX with YAML frontmatter (`title`, `description`, `order`, optional `llms`)
- `src/content/docs.ts` — frontmatter schema, section order, icons, and sort helpers
- `src/content-nav.ts` — sidebar navigation from `ecopages:content/docs`
- `src/lib/docs/` — MDX plugin options, catch-all slug helpers, and LLM URL generation
- `src/layouts/docs-layout/` — sidebar, mobile trigger, table of contents, docs bar, pagination
- `src/pages/index.tsx` — homepage with links into the docs set
- `src/pages/docs/[...slug]/index.tsx` — catch-all route using `entries` and `getComponent`
- `src/styles/components/prose.css` — markdown typography (skips `.unstyled`)

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Add pages as `<section>/<slug>.mdx` with frontmatter; reorder with `order` and `DOCS_SECTION_ORDER`.
- Import each JSX component directly in the MDX document that uses it. Use `class="unstyled"` on alerts and other chrome so prose styles do not restyle them.

## Docs chrome

- `RuiSidebar` — section groups from `docsNav`
- `RuiToc` — `h2` / `h3` on the current page
- `RuiBreadcrumb` — resolved server-side from `docsNav` and passed into the docs layout
- Cycle theme toggle — system / light / dark, persisted in `localStorage`
- `CopyForLlm` — fetches `/docs-llm/<section>/<slug>.md` for the current page (path-derived; see LLM exports)
- Previous / next pagination across the flattened docs set

## LLM exports

This template publishes an agent index; it is not a hosted API.

| Surface                         | Role                                               |
| ------------------------------- | -------------------------------------------------- |
| `/llms.txt`                     | Index only (when-to-use, CLI, section links)       |
| `/docs-llm/<section>/<slug>.md` | Raw MDX body for one exported page                 |
| HTML `rel="alternate"`          | Advertises the markdown URL from the docs pathname |

`pnpm run generate:llms` runs before `dev` and `build`. `ContentScanner` reads `src/content/docs`; the script writes `src/public/llms.txt` and **replaces** `src/public/docs-llm/`. Deleted pages and `llms: false` entries are omitted from the index and removed from that tree.

Absolute links in `llms.txt` use `configuredSiteOrigin()` in `src/lib/docs/site-meta.ts` — the same helper `eco.config.ts` passes to `setBaseUrl()`. Set `ECOPAGES_BASE_URL` or change that helper. Do not hardcode a different origin only on `setBaseUrl()`.

HTML alternate tags and Copy for LLM do **not** read `llms`. After generate, an excluded page can still point at a markdown URL that is gone. Treat generator output as the fetch contract.

`setSitemap({ enabled: true, extraUrls: ['/llms.txt'] })` writes `sitemap.xml` during `ecopages build` / `preview` only. `ecopages dev` does not serve it.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm run generate:llms
pnpm test
```

Open `/` for the homepage and `/docs/getting-started/introduction` for the first docs page.

## Full docs app

See `apps/docs` for the production docs app: more sections, code tabs, and syntax highlighting.
