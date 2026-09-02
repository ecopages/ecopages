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

- Frontmatter requires `title` and `description`. The catch-all page sets `url` (`/docs/${entry.slug}`) for canonical and Open Graph tags.
- HTML docs pages emit `rel="alternate" type="text/markdown"` for `/docs-llm/<section>/<slug>.md`. That URL is derived from the pathname; it does not consult `llms`.
- Set `llms: false` to omit a page from `llms.txt` and to drop its file from the next generate. Direct fetch of an old URL can 404 after generate even if HTML still advertises the alternate.
- `scripts/generate-llm-docs.ts` runs before `dev` and `build`. It writes `llms.txt` and **replaces** `src/public/docs-llm/`. Absolute index links use `configuredSiteOrigin()`, which `eco.config.ts` also passes to `setBaseUrl()`.
- Sitemap is opt-in in core; this app enables it (`extraUrls`: `/llms.txt`, `/skill.txt`; `exclude`: `/404`, `/500`). `/sitemap.xml` is not served by `ecopages dev`.

## Routing

- The catch-all page parses slug segments, finds the entry with `entries.find` on the joined slug, then lazy-loads MDX via `getComponent(entry.slug)`.
- Forward entry-specific deps with `getEntryDependencies(props.entry.slug)`. MDX components are called as `Content({})`.
