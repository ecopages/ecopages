---
title: LLM Wiki Site
sources: []
updated: 2026-08-15
---

# LLM Wiki Site

The optional Ecopages app turns the parent `wiki/` vault into a browsable documentation site. The vault remains the source of truth; the app-generated collection is disposable output.

## Content pipeline

On `pnpm dev` and `pnpm build`, the ingest processor reads `../wiki/`, validates page frontmatter, rewrites supported relative Markdown links, and writes MDX files to `src/content/wiki/`. It also copies `../sources/*.md` to `src/public/sources/` and generates the sidebar sort data.

Never edit either generated location. Make content changes in the vault, then let the next dev/build run regenerate them.

## Runtime capabilities

- Wiki pages render at `/wiki/<category>/<page>`.
- The home paths `/` and `/wiki` redirect to `WIKI_HOME_SLUG`, if configured, or the first canonically ordered page.
- Source names in frontmatter render as links to `/sources/<source-name>.md`.
- The browser search box reads the generated `/search-index.json`; `GET /api/search?q=<query>` is available in `dev` and `start`.
- Markdown retrieval is available from the page URL through Accept negotiation, a `.md` suffix, or `?format=md`. See [agent markdown access](../concept/agent-markdown-access.md).

## Operational boundary

`pnpm preview` serves static build output. It can serve generated `.md` files and the browser search index, but it does not serve API routes or content negotiation. Use `pnpm dev` during authoring and `pnpm start` when testing the server behavior.

## Reference implementation

- `app/eco.config.ts` registers the ingest and content processors.
- `app/src/lib/obsidian/` owns ingestion, source copying, link rewriting, and Obsidian mirroring.
- `app/src/lib/md-response/` owns markdown response behavior.
- `app/src/lib/search/` owns the search index and API route.

See [wiki structure](../concept/wiki-structure.md) for the vault contract and [maintain the wiki](../recipe/maintain-wiki.md) for the authoring workflow.
