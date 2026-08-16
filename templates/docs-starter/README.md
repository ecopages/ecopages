# Docs starter template

An Ecopages docs site using `@ecopages/content-processor`, frontmatter-driven MDX, and a catch-all docs route. Chrome uses `@ecopages/radiant-ui` (sidebar, TOC, breadcrumb, cycle theme toggle, alerts).

## Structure

- `src/content/docs/**` — MDX with YAML frontmatter (`title`, `description`, `order`)
- `src/content/docs.ts` — frontmatter schema, section order, icons, and sort helpers
- `src/content-nav.ts` — sidebar navigation from `ecopages:content/docs`
- `src/lib/docs/` — MDX plugin options and catch-all slug helpers
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
- `RuiBreadcrumb` — resolved server-side from `docsNav`
- Cycle theme toggle — system / light / dark, persisted in `localStorage`
- `CopyForLlm` — fetches the LLM export URL for the current page
- Previous / next pagination across the flattened docs set

## LLM exports

`scripts/generate-llm-docs.ts` uses `ContentScanner` to write `src/public/llms.txt` and `src/public/docs-llm/**/*.md` before `dev` and `build`. Set `llms: false` in frontmatter to exclude a page.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm run generate:llms
```

Open `/` for the homepage and `/docs/getting-started/introduction` for the first docs page.

## Full docs app

See `apps/docs` for the production docs app: more sections, code tabs, and syntax highlighting.
