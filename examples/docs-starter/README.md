# Docs starter

Minimal Ecopages docs site using `@ecopages/content-processor`, frontmatter-driven MDX, and a catch-all docs route.

## Structure

- `src/content/docs/**` — MDX with YAML frontmatter (`title`, `description`, `order`)
- `src/content/docs.ts` — frontmatter schema, section order, and sort helpers
- `src/content-nav.ts` — sidebar navigation from `ecopages:content/docs`
- `src/lib/docs/` — MDX component map and plugin options
- `src/layouts/docs-layout/` — docs layout shell and docs bar
- `src/pages/docs/[...slug]/index.tsx` — catch-all route using `entries` and `getComponent`

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Add pages as `<section>/<slug>.mdx` with frontmatter; reorder with `order` and `DOCS_SECTION_ORDER`.
- Add shared MDX components in `src/lib/docs/mdx-components.ts`.

## Docs bar

- `Breadcrumb` — resolved server-side from `docsNav`
- `CopyForLlm` — Radiant clipboard component (`radiant-copy-for-llm`) that fetches the LLM export URL

## LLM exports

`scripts/generate-llm-docs.ts` uses `ContentScanner` to write `src/public/llms.txt` and `src/public/docs-llm/**/*.md` before `dev` and `build`. Set `llms: false` in frontmatter to exclude a page.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm run generate:llms
```

Open `/docs/getting-started/introduction` after starting the dev server.

## Full docs app

See `apps/docs` for the full docs app: sidebar icons, table of contents, and pagination.
