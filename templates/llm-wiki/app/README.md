# LLM Wiki site (`app/`)

Self-contained Ecopages app that renders the parent [`../wiki`](../wiki) vault as browsable docs at `/wiki`. Run package commands from this directory; the CLI manifest marks it as the runnable package directory.

## Content pipeline

- Source of truth: `../wiki/`. The default auto mode accepts either category
  directories (`wiki/<category>/<page>.md`) or flat files with `category` in
  frontmatter; mixed layouts fail fast.
- Generated: `src/content/wiki` and `src/public/wiki` are wiped and rewritten from the vault on every `pnpm dev` / `pnpm build`.
- Ingest: `src/lib/wiki/ingest.ts` validates frontmatter, normalizes both layouts to
  category/page slugs, and regenerates `../index.md`. Link rewrite lives in `src/lib/wiki/links.ts`.
- Nav / sort: the root `../wiki/sortspec.md` orders categories; each category's `sortspec.md` orders pages. Ingest writes the result to `src/content/wiki-sort-order.json`.

## Systems (`src/lib`)

| System          | Role                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| **obsidian**    | Build-plugin watch/rebuild and optional `pnpm sync:obsidian` mirror |
| **wiki**        | Vault load, ingest, catalog, graph lint, link rewrite, catch-all slugs ([README](./src/lib/wiki/README.md)) |
| **md-response** | Markdown negotiation (`Accept`, `.md` suffix, `/api/wiki/[...slug]`)                            |
| **search**      | Token search engine, `/api/search` for agents, `search-index.json` for the browser              |
| **cx**          | `cx(...classes)` — join class names, skip falsy values                             |

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm sync:obsidian
pnpm lint:wiki
pnpm test
```

## Agent markdown

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s http://localhost:3333/api/wiki/app/demo
curl -s 'http://localhost:3333/api/search?q=demo'
```

HTML pages advertise `<link rel="alternate" type="text/markdown">`. `/api/search`, `/api/wiki/...`, and Accept negotiation require `dev` or `start`; static `preview` serves the generated `.md` files and `search-index.json` only.
