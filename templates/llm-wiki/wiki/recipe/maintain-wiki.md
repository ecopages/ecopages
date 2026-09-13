---
title: Maintain wiki
summary: add or update a page without breaking ingest, navigation, or provenance
sources: []
paths:
    - app/src/lib/wiki/ingest.ts
    - app/src/lib/wiki/links.ts
    - app/src/lib/wiki/vault.ts
    - app/src/lib/wiki/catalog.ts
    - app/src/lib/wiki/lint.ts
updated: 2026-09-13
---

# Maintain Wiki

Use this workflow to add or revise maintained knowledge without breaking the vault-to-site pipeline.

## Add or revise a page

1. Read `index.md`, then the related wiki pages and relevant implementation or source material.
2. Keep raw input in `sources/` unchanged. Add a new dated source instead of editing or replacing an existing source.
3. Write the maintained interpretation in `wiki/<category>/<page>.md`. Use a lowercase-kebab-case filename and required `title`, `summary`, and `updated` frontmatter. Cite raw source filenames in `sources` when applicable. Recipe pages also declare `paths` pointing at files relative to the llm-wiki root.
4. Link the page to related knowledge with plain relative Markdown links. Use `./sibling.md` within a category and `../<category>/<page>.md` across categories.
5. Add the page title to its category's `sortspec.md` when it needs an explicit position. Add a category directory name to root `wiki/sortspec.md` when it needs an explicit sidebar position.
6. Append a dated, parseable entry to `log.md`. Ingest regenerates `index.md` from `summary` fields; do not edit the catalog by hand.

## Verify the result

From the repository root, build the site:

```bash
pnpm --filter @ecopages/template-llm-wiki build
```

Run machine lint from `app/`:

```bash
pnpm --filter @ecopages/template-llm-wiki lint:wiki
```

Then, while `pnpm --filter @ecopages/template-llm-wiki dev` is running, retrieve the changed page as Markdown:

```bash
curl -s http://localhost:3333/wiki/<category>/<page>.md
```

Confirm that the page is present in the sidebar in the expected position, its source links resolve when declared, and its Markdown links point to `/wiki/...` URLs after ingestion.

## Reference implementation

`app/src/lib/wiki/ingest.ts` validates page names and frontmatter, rejects ambiguous mixed vault layouts, copies sources, generates sort order, writes static `.md` alternates under `src/public/wiki`, and rewrites `index.md`. `app/src/lib/wiki/links.ts` rewrites supported Markdown links. `app/src/lib/wiki/lint.ts` walks the vault link graph.

See [wiki structure](../concept/wiki-structure.md) for the data model and [agent markdown access](../concept/agent-markdown-access.md) for the retrieval contract.
