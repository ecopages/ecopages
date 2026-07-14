# Docs App

## Content

- Docs live under `src/content/docs/<section>/<slug>.mdx` with YAML frontmatter (`title`, `description`, `order`, optional `llms`).
- Section titles and sidebar icons are configured in `src/content/docs.ts`.
- MDX modules resolve through `@ecopages/content-processor` (`ecopages:content/docs`) via `buildDocsSiteContent()`.
- Do not add per-page `export const config` in MDX files; routing and layout live in the catch-all page.
- Shared JSX (`Banner`, `CodeTabs`, etc.) is injected via `getDocsMdxComponents()` at render time.
- Add explicit imports only when content needs module bindings (for example `ecopages:images` spreads).

## Configuration

- App-specific docs-kit wiring lives in `src/docs-kit.instance.ts` (`defineDocsKit()`).
- Register `contentProcessorPlugin()` in `eco.config.ts` for the docs MDX collection.
- Inject shell layout, MDX components, and burger events there — not inside `src/lib/docs-kit/`.

## Navigation

- Add or edit `<section>/<slug>.mdx` under `src/content/docs/` with frontmatter metadata.
- Reorder pages with the `order` field; reorder sections in `DOCS_SECTION_ORDER` (`src/content/docs.ts`).

## Page metadata

- Every page requires `title` and `description` in frontmatter for SEO metadata.
- Set `llms: false` in frontmatter to exclude a page from LLM exports.

## Routing

- The catch-all page resolves entries via `getEntryBySegments()` and renders `<Content components={getDocsMdxComponents()} />`.
