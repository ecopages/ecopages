# llm-wiki site (`app/`)

Self-contained Ecopages app that renders the parent [`../wiki`](../wiki) vault as browsable docs at `/wiki`.

## Content pipeline

- Source of truth: `../wiki/`. The default auto mode accepts either category
  directories (`wiki/<category>/<page>.md`) or flat files with `category` in
  frontmatter; mixed layouts fail fast.
- Generated: `src/content/wiki` is wiped and rewritten from the vault on every `pnpm dev` / `pnpm build`.
- Ingest: `src/lib/obsidian/` validates frontmatter, normalizes both layouts to
  category/page slugs, and rewrites relative wiki links.
- Nav / sort: the root `../wiki/sortspec.md` orders categories; each category's `sortspec.md` orders pages. Ingest writes the result to `src/content/wiki-sort-order.json`.

## Systems (`src/lib`)

| System          | Role                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| **obsidian**    | Vault ingest, link rewrite, watch/rebuild, optional `pnpm sync:obsidian` mirror    |
| **md-response** | Markdown negotiation (`Accept`, `.md` suffix, `/api/.../:slug`)                    |
| **search**      | Token search engine, `/api/search` for agents, `search-index.json` for the browser |
| **wiki**        | Collection access, catch-all slugs, wiki URL matching                              |
| **cx**          | `cx(...classes)` — join class names, skip falsy values                             |

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm sync:obsidian
```

## Agent markdown

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s 'http://localhost:3333/api/search?q=demo'
```

HTML pages advertise `<link rel="alternate" type="text/markdown">`. `/api/search` and Accept negotiation require `dev` or `start`; static `preview` serves the generated `.md` files and `search-index.json` only.
