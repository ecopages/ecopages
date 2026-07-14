# Docs App

## Content

- Docs live under `src/content/docs/<section>/<slug>.mdx` with YAML frontmatter (`title`, `description`, `order`, optional `llms`).
- Section titles and sidebar icons are configured in `src/content/docs.ts`.
- MDX modules resolve through `@ecopages/content-processor` (`ecopages:content/docs`).
- Sidebar navigation is built in `src/lib/content-nav.ts` from processor `entries`.
- Do not add per-page `export const config` in MDX files; routing and layout live in the catch-all page.
- Shared JSX (`Banner`, `CodeTabs`, etc.) is registered in `src/lib/docs/mdx-components.ts` and passed via `getDocsMdxComponents()` at render time.
- Add explicit imports only when content needs module bindings (for example `ecopages:images` spreads).

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Docs layout chrome lives under `src/layouts/docs-layout/`; shared docs utilities under `src/lib/docs/`.

## Navigation

- Add or edit `<section>/<slug>.mdx` under `src/content/docs/` with frontmatter metadata.
- Reorder pages with the `order` field; reorder sections in `DOCS_SECTION_ORDER` (`src/content/docs.ts`).

## Page metadata

- Every page requires `title` and `description` in frontmatter for SEO metadata.
- Set `llms: false` in frontmatter to exclude a page from LLM exports.

## Routing

- The catch-all page resolves entries via `getEntryBySegments()` and renders `<Content components={getDocsMdxComponents()} />`.
