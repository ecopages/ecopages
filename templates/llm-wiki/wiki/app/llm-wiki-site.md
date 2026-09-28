---
title: LLM Wiki Site
summary: runtime behavior and operational boundaries of the browsable site
sources: []
updated: 2026-09-13
---

# LLM Wiki Site

The optional Ecopages app turns the parent `wiki/` vault into a browsable documentation site. The vault remains the source of truth; the app-generated collection is disposable output.

## Content pipeline

On `pnpm dev` and `pnpm build`, the ingest processor reads `../wiki/`, validates page frontmatter, rewrites supported relative Markdown links, and writes MDX files to `src/content/wiki/` plus static `.md` alternates to `src/public/wiki/`. It also copies `../sources/*.md` to `src/public/sources/`, generates the sidebar sort data, and rewrites the vault-root `index.md` catalog from each page's `summary`.

Never edit the generated collection or `index.md` by hand. Make content changes in the vault (including `summary`), then let the next dev/build run regenerate them.

## Runtime capabilities

- `/` is the catalog Page. `/wiki` redirects there.
- The catalog Page opens the same search palette as the header.
- Wiki pages render at `/wiki/<category>/<page>`. The docs bar shows breadcrumbs and a copy-for-LLM control that fetches the page markdown alternate.
- The catalog and error Pages omit the docs bar.
- `WIKI_HOME_SLUG` is an opt-in override: when set, `/` redirects to that wiki page instead of the catalog.
- Source names in frontmatter render as links to `/sources/<source-name>.md`.
- The browser search box reads the generated `/search-index.json`; `GET /api/search?q=<query>` is available in `dev` and `start`.
- Markdown retrieval is available from the page URL through Accept negotiation, a `.md` suffix, or `?format=md`, and from `GET /api/wiki/<category>/<page>`. See [agent markdown access](../concept/agent-markdown-access.md).

## Operational boundary

`pnpm preview` serves static build output. It can serve generated `.md` files and the browser search index, but it does not serve API routes or content negotiation. Use `pnpm dev` during authoring and `pnpm start` when testing the server behavior.

## Reference implementation

- `app/eco.config.ts` registers the ingest and content processors.
- `app/src/lib/obsidian/` owns the ingest build plugin and Obsidian vault mirroring.
- `app/src/lib/wiki/` owns vault load, ingest, catalog markdown, and link rewriting.
- `app/src/lib/md-response/` owns markdown response behavior.
- `app/src/lib/search/` owns the search index and API route.

See [wiki structure](../concept/wiki-structure.md) for the vault contract and [maintain the wiki](../recipe/maintain-wiki.md) for the authoring workflow.
