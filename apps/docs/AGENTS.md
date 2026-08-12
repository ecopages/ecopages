# Docs App

## Content

- Docs live under `src/content/docs/<section>/<slug>.mdx` with YAML frontmatter (`title`, `description`, `order`, optional `llms`).
- Section titles and sidebar icons are configured in `src/content/docs.ts`.
- MDX modules resolve through `@ecopages/content-processor` (`ecopages:content/docs`).
- Sidebar navigation is built in `src/lib/content-nav.ts` from processor `entries`.
- Do not add layout or routing `export const config` in MDX files; the catch-all page owns routing and layout.
- Shared MDX chrome like `CodeTabs` is registered on `DocsLayout` so its CSS/scripts load on every docs page. Entry-specific interactive demos still declare `export const config = { dependencies: { components: [...] } }` in MDX.
- Each MDX document imports the interactive components it renders (`CodeTabs`, `RuiAlert`, `ApiField`, and so on).
- Docs chrome uses `@ecopages/radiant-ui` (sidebar, toc, breadcrumb, tabs, alerts, buttons, cycle theme toggle).
- Prose styles must exclude `.unstyled` / `.unstyled *` so alerts, code tabs, and other chrome are not restyled by `.prose`.

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Docs layout chrome lives under `src/layouts/docs-layout/`; navigation helpers in `src/lib/content-nav.ts`; MDX config in `src/lib/docs/`.

## Navigation

- Add or edit `<section>/<slug>.mdx` under `src/content/docs/` with frontmatter metadata.
- Reorder pages with the `order` field; reorder sections in `DOCS_SECTION_ORDER` (`src/content/docs.ts`).

## Page metadata

- Every page requires `title` and `description` in frontmatter for SEO metadata.
- Set `llms: false` in frontmatter to exclude a page from LLM exports.

## Routing

- The catch-all page resolves entries via `getEntryBySegments()`, renders page chrome plus `<Content />`, and forwards entry-specific deps with `getEntryDependencies(props.entry.slug)`.
