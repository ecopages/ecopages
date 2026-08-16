# llm-wiki schema

Conventions and workflows for maintaining this wiki. Co-evolve this file as we learn what works — it's not fixed.

## Layers

- `sources/` — raw, immutable inputs. Never edit these after adding them; if a source is superseded, add a new one and note the supersession in the wiki page. Sources are copied into `app/src/public/sources/` during ingest and linked from wiki pages.
- `wiki/` — LLM-maintained markdown pages organized by category directories. This is the layer you read; the agent writes and keeps it current.
- `index.md` — catalog of every wiki page, one line each, grouped by category.
- `log.md` — append-only chronological record of ingests, queries, and lint passes.

## Directory structure

Pages live in category directories under `wiki/`:

```
wiki/
  app/
    sortspec.md          # page ordering for this category
    demo.md
    another-entry.md
  concept/
    sortspec.md
    wiki-structure.md
  recipe/
    sortspec.md
    ingest-source.md
```

The directory name is the category. The filename is the page slug. URLs follow the pattern `/wiki/<category>/<page>` (e.g. `/wiki/app/demo`).

The root `wiki/sortspec.md` optionally orders categories. Any category omitted there still appears in the sidebar after explicitly ordered categories, alphabetically. Each category's `sortspec.md` optionally orders the pages in that category.

## Page categories

- `app/` — a host app or product surface.
- `package/` — a shared library with no product behavior of its own.
- `concept/` — cross-cutting vocabulary and invariants. Not step-by-step how-tos.
- `recipe/` — a procedural house pattern ("how do we do X here"), with a pointer to a real source file.
- `entity/` — a recurring named thing (a customer, an integration, a person).
- `decision/` — a specific decision and its rationale, when it does not belong on another page.

### Concepts vs recipes

- Put **why / what must stay true** on the concept page.
- Put **how to implement that here** on a recipe page, with a pointer to the reference implementation.
- A concept may show a minimal type or input shape when it clarifies the model; walkthroughs go in recipes.
- Cross-link both ways: concept -> recipe under the relevant section; recipe -> concept + canonical paths.

## Cross-referencing

Use plain relative markdown links, not Obsidian wiki-links — keeps the wiki portable outside Obsidian.

### Same category

Link to a sibling page with `./`:

```markdown
[another entry](./another-entry.md)
```

### Cross-category

Link to a page in another category with `../<category>/<page>.md`:

```markdown
[wiki structure](../concept/wiki-structure.md)
```

Every page should link to related pages; a page with no inbound links is a lint finding, except a deliberately chosen landing page.

## Page ordering

Pages appear in the sidebar ordered by:

1. **Category** — root `wiki/sortspec.md`, then remaining discovered categories alphabetically
2. **Explicit position** — from per-directory `sortspec.md` (Obsidian Custom Sort format)
3. **Title alphabetically** — tiebreaker for unlisted pages

Each category directory contains a `sortspec.md` that controls page ordering within that category. Edit this file to reorder pages. Pages listed first appear first; unlisted pages fall to the end alphabetically. The root `sortspec.md` uses the same `sorting-spec` field, but lists category directory names instead of page titles.

```yaml
---
sorting-spec: |
    LLM Wiki Demo
    Another Entry
---
# Sort Specification

Controls the order of wiki pages in this category.
```

When you add or rename a page, update the category's `sortspec.md` to include it in the desired position.

## Frontmatter

```yaml
---
title: How identity is established
sources: [2026-08-15-auth-notes]
updated: 2026-08-15
---
```

`title` and `updated` are required strings. `sources` is optional and defaults to an empty list. In a category-directory vault, the directory supplies `category`; do not add it to page frontmatter. A flat vault must provide a valid lowercase-kebab-case `category` in every page's frontmatter.

The `category` is derived from the directory name, not frontmatter.

## Obsidian integration

This wiki uses [Custom Sort](https://github.com/SebastianMC/obsidian-custom-sort) by SebastianMC for page ordering. Install the plugin in Obsidian to reorder pages via drag-and-drop in the file explorer.

Each category directory contains a `sortspec.md` with the `sorting-spec` YAML key. The plugin reads these files and sorts the file explorer accordingly.

## Operations

**Ingest.** Given a new source: read it, discuss key takeaways with the user, save the raw source under `sources/` with a dated filename, then update/create the relevant `wiki/` pages, update `index.md`, and append an entry to `log.md`. Flag contradictions with existing pages instead of silently overwriting. Sources are automatically copied to `app/src/public/sources/` and linked from wiki pages that reference them.

**Query.** Read `index.md` first to find candidate pages, then read those pages before answering. Cite which wiki pages the answer draws from. If the answer synthesizes something new and reusable, offer to file it back as a new or updated page.

**Lint.** On request, check for: contradictions between pages, claims a newer source has superseded, orphan pages, concepts mentioned but lacking their own page, missing cross-references, invalid internal links, and recipes whose paths no longer match the codebase. Report findings; don't auto-fix without confirmation.

## index.md format

```
## Apps
- [demo](./wiki/app/demo.md) — template landing page

## Concepts
- [wiki-structure](./wiki/concept/wiki-structure.md) — how the wiki is organized

## Recipes
- [ingest-source](./wiki/recipe/ingest-source.md) — file a new source into the wiki
```

## log.md format

Append-only, most-recent last, each entry starting with a parseable prefix:

```
## [2026-08-15] ingest | auth-notes
Updated concept/auth.md. New page: recipe/ingest-source.md.
```
