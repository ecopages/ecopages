# Docs starter

Minimal Ecopages docs site using a content tree, manifest-driven navigation, and a catch-all docs route.

## Structure

- `src/content/docs/**` — body-only MDX content
- `src/docs-kit/**` — compile helpers, manifest, layout, and docs chrome (mirrors `apps/docs/src/lib/docs-kit` patterns)
- `src/docs-kit.instance.ts` — app-specific wiring via `defineDocsKit()`
- `src/pages/docs/[...slug]/index.tsx` — single catch-all route for all docs pages

## Configuration

- Edit `src/content/docs/content.meta.ts` to add, remove, or reorder pages (and wire MDX modules in `content.ts`).
- Every `.mdx` file under `src/content/docs` must appear in the manifest; orphan files fail `buildDocsManifest()`.
- Inject shell layout and MDX components in `src/docs-kit.instance.ts`.

## Docs bar

The docs layout composes kit-local components:

- `Breadcrumb` — receives `items` via props (resolved server-side from the manifest)
- `CopyForLlm` — SSR markup with a Radiant script for clipboard behavior only (no client render override)

Markup lives in `eco.component` render functions so layout HMR updates text and structure immediately.

## LLM exports

`scripts/generate-llm-docs.ts` writes `src/public/llms.txt` and `src/public/docs-llm/**/*.md` from the manifest before `dev` and `build`. Pages can opt out with `llms: false` in `content.meta.ts`.

For the full Ecopages agent skill pack, see [ecopages.app/skill.txt](https://ecopages.app/skill.txt).

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm run generate:llms
```

Open `/docs/getting-started/introduction` after starting the dev server.

## Full docs app

See `apps/docs` for the complete docs kit: sidebar icons, table of contents, pagination, and the progressive agent skill pack under `src/public/skill/`.
