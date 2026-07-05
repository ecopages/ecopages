# Docs starter

Minimal Ecopages docs site using a content tree, manifest-driven navigation, and a catch-all docs route.

## Structure

- `src/content/docs/**` — body-only MDX content
- `src/docs-kit/**` — compile helpers, manifest, layout, and docs chrome (mirrors `apps/docs/src/lib/docs-kit` patterns)
- `src/pages/docs/[...slug]/index.tsx` — single catch-all route for all docs pages

## Docs bar

The docs layout composes local docs-kit components:

- `Breadcrumb` — receives `items` via props (resolved server-side from the manifest)
- `CopyForLlm` — SSR markup with a Radiant script for clipboard behavior only (no client render override)

Markup lives in `eco.component` render functions so layout HMR updates text and structure immediately.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
```

Open `/docs/getting-started/introduction` after starting the dev server.

## Full docs app

See `apps/docs` for the complete docs kit: sidebar icons, table of contents, pagination, and static LLM exports under `src/public/docs-llm/`.
