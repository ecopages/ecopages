---
title: Wiki structure
sources: []
updated: 2026-08-15
---

# Wiki structure

The LLM wiki separates immutable evidence from maintained interpretation and generated site output.

## Layers

- `sources/` contains immutable raw inputs. A page can name a source file in frontmatter; the site copies it to `/sources/<name>.md`.
- `wiki/` contains maintained Markdown pages. It is the source of truth for the site and the layer agents update.
- `index.md` catalogs every maintained page. `log.md` is the append-only operational record.
- `app/src/content/wiki/` and `app/src/content/wiki-sort-order.json` are generated during ingestion. Do not edit them.

## Page layout and identity

The default vault layout is directory-based: `wiki/<category>/<page>.md`. Both category and page filenames must be lowercase kebab-case. A page's public URL is `/wiki/<category>/<page>`.

The ingester also supports a flat layout where every page declares `category` in frontmatter. Do not mix flat pages and category directories when `WIKI_CATEGORY_MODE=auto`; ingestion fails rather than guessing.

## Ordering

Root `wiki/sortspec.md` controls category order. Each category's `sortspec.md` controls page order by title. Unlisted categories and pages remain visible and fall back to alphabetical order.

## Invariants

- Preserve raw sources; supersede them by adding a newer source and recording the relationship in a maintained page.
- Keep pages connected with relative Markdown links and list every page in `index.md`.
- Treat the generated site content as output, never an editing surface.

See [maintain the wiki](../recipe/maintain-wiki.md) for the authoring procedure and [LLM Wiki Site](../app/llm-wiki-site.md) for how the app ingests the vault.
