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
- Radiant and Lit custom-element hosts register scripts with `dependencies.scripts: [{ src: './…script.ts', ssr: true }]`. `docs-layout.script.ts` uses the same pattern so sidebar, triggers, and shell chrome SSR; guard `document` / navigation listeners with `isServer` from `@ecopages/radiant/is-server`. `base-layout.script.ts` stays browser-only (router, clipboard).
- Prose styles must exclude `.unstyled` / `.unstyled *` so alerts, code tabs, and other chrome are not restyled by `.prose`.
- Prose `<table>` elements scroll horizontally in CSS (`display: block`, `max-width: 100%`, `overflow-x: auto`). Do not wrap them in MDX or rehype markup.

## Recipes

- `src/content/docs/recipes/` is the Recipes section. Each recipe is one page plus a fixture app under `examples/recipes/<name>/` (see its README); CI typechecks it and builds it with `pnpm run smoke:recipes`.
- Recipe code on a page comes from the fixture: a fence with `file="<path from the repo root>"` and optional `region="<name>"` is filled by `remarkSnippetInclude` (`src/lib/docs/snippet-include.ts`) and by `scripts/llm-docs-export.ts` for `docs-llm`. Leave the fence body empty.
- `src/lib/docs/mdx-plugin-options.ts` imports the Diagrams fixture's `remarkMermaid` directly, so the docs app runs the recipe it teaches; `src/styles/components/diagram.css` is the docs theme mapping.

## Developer area

- `src/content/dev/<slug>.mdx` is the `dev` collection, served at `/dev/<slug>` by `src/pages/dev/[slug].tsx`; `index.mdx` is the overview served at `/dev` by `src/pages/dev/index.tsx`. It documents the framework's internals for maintainers. The `section` frontmatter value (`overview`, `build`, `rendering`, `development`, `hmr`, `packages`; see `DEV_SECTION_ORDER` in `src/content/dev.ts`) places a page in the sidebar and `order` sorts it. `sources:` is metadata, not checked in CI. Never link the area from the footer or site-wide navigation; only the "Under the hood" notes at the end of three public pages link in.
- The area is hidden: the docs sidebar, pagination and `llms.txt` read only the `docs` collection, every page sets `robots: DEV_ROBOTS` (`noindex`, which also drops it from `sitemap.xml`), and the only links in are the "Under the hood" notes at the end of three public pages (Deployment, Custom Integration, HMR).
- `DevLayout` (`src/layouts/docs-layout/`) is the docs shell with the developer sidebar (`src/lib/dev-nav.ts`) under its own persist id.
- Frontmatter requires `title`, `description`, `section` and `sources`: the repository paths the page describes, a directory ending in `/`. Keep them accurate: when the code a page lists changes, update the page. Diagrams are `mermaid` code fences.

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Docs layout chrome lives under `src/layouts/docs-layout/`; navigation helpers in `src/lib/content-nav.ts`; MDX config in `src/lib/docs/`.
- Fenced MDX code blocks use `rehype-pretty-code` with `transformerCopyButton`. A follow-up rehype pass stores source on `data-rehype-pretty-copy` because the MDX JSX renderer does not preserve the transformer's `data` / `class` / `onclick` attributes. Clipboard handling lives in `src/layouts/base-layout/base-layout.script.ts`.
- `CodeTabs` highlights every tab on the server in `src/lib/docs/code-highlighter.ts`, with the same Shiki themes as fences (`shiki-themes.ts`); the browser only renders the HTML. A tab takes `code` plus an optional `lang` (inferred from the label, then shell for install commands, else `tsx`). MDX strips up to two columns of indentation from each continuation line of a template literal, so indented code goes in a file under `src/snippets/` and a tab names it with `file` (relative to the docs app root). Fences without a language fall back to `text` so they share the figure styling.

## Styling

- `eco.config.ts` registers `lightningCssProcessorPlugin` with the Tailwind v4 preset and the opt-in `suffixNesting()` plugin, which expands the Sass-style `&--x` / `&__x` nesting the stylesheets use. Browser `targets` repeat the PostCSS preset's former autoprefixer default. Keep the stylesheets in plain CSS nesting plus Tailwind `@apply`; there is no PostCSS in this app.

## Navigation

- Add or edit `<section>/<slug>.mdx` under `src/content/docs/` with frontmatter metadata.
- Reorder pages with the `order` field; reorder sections in `DOCS_SECTION_ORDER` (`src/content/docs.ts`).

## Page metadata

- Frontmatter requires `title` and `description`. The catch-all page sets `url` (`/docs/${entry.slug}`) for canonical and Open Graph tags.
- HTML docs pages emit `rel="alternate" type="text/markdown"` for `/docs-llm/<section>/<slug>.md`. That URL is derived from the pathname; it does not consult `llms`.
- Set `llms: false` to omit a page from `llms.txt` and to drop its file from the next generate. Direct fetch of an old URL can 404 after generate even if HTML still advertises the alternate.
- `scripts/generate-llm-docs.ts` runs before `dev` and `build`. It writes `llms.txt` and **replaces** `src/public/docs-llm/`. Absolute index links use `configuredSiteOrigin()`, which `eco.config.ts` also sets as `baseUrl`.
- Sitemap is opt-in in core; this app enables it (`extraUrls`: `/llms.txt`, `/skill.txt`; `exclude`: `/404`, `/500`). `/sitemap.xml` is not served by `ecopages dev`.

## Routing

- The catch-all page parses slug segments, finds the entry with `entries.find` on the joined slug, then lazy-loads MDX via `getComponent(entry.slug)`.
- Forward entry-specific deps with `mergePageDependencies({ components: [CopyForLlm] }, await getEntryDependencies(props.entry.slug))`. MDX components are called as `Content({})`.
