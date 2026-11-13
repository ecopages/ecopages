# Docs starter template

An Ecopages docs site using `@ecopages/content-processor`, frontmatter-driven MDX, and a catch-all docs Page. Chrome uses `@ecopages/radiant-ui` (sidebar, TOC, breadcrumb, cycle theme toggle, alerts). Fenced MDX code blocks are highlighted with `rehype-pretty-code` and include a Copy button; headings get ids at build time so `#fragment` links resolve before any script runs.

## Agent skills

[AGENTS.md](./AGENTS.md). Packs in this template:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))
- [Building with Radiant UI](.agents/skills/radiant-ui/SKILL.md) ([hosted](https://radiant-ui.ecopages.app/skill/SKILL.md))
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) ([hosted](https://radiant.ecopages.app/skill/SKILL.md))

Index: [`.agents/README.md`](.agents/README.md). Those packs describe the framework. Generated docs for _this_ site are `/llms.txt` and `/docs-llm/<section>/<slug>.md` (see [LLM exports](#llm-exports)).

## Structure

- `src/content/docs/**` — MDX with YAML frontmatter (`title`, `description`, `order`, optional `llms`)
- `src/content/docs.ts` — frontmatter schema, section order, icons, and sort helpers
- `src/content-nav.ts` — sidebar navigation from `ecopages:content/docs`
- `src/lib/docs/` — MDX plugin options (`createDocsMdxPlugins`), heading ids, copy-button compatibility, catch-all slug helpers, breadcrumb and previous/next helpers, and LLM URL generation
- `src/components/code-tabs/` — `CodeTabs`, a tabbed, highlighted block with its own Copy button (see [Code tabs](#code-tabs))
- `src/layouts/docs-layout/` — sidebar, mobile trigger, table of contents, docs bar, pagination
- `src/pages/index.tsx` — homepage with links into the docs set
- `src/pages/docs/[...slug]/index.tsx` — catch-all route using `entries` and `getComponent`
- `src/styles/components/prose.css` — markdown typography (skips `.unstyled`; tables scroll with `overflow-x: auto`)
- `src/styles/vendor/shiki.css` — pretty-code figure chrome and copy-button layout
- `src/styles/fonts.css` and `scripts/copy-font-assets.mjs` — IBM Plex, copied from the Fontsource packages into `src/public/assets/fonts` before `dev`, `build` and `preview`
- `.agents/skills` — Ecopages, Radiant, and Radiant UI skill packs

## Configuration

- Register `contentProcessorPlugin()` from `@ecopages/content-processor/plugin` in `eco.config.ts`.
- Fenced code highlighting, heading ids and copy buttons are configured in `src/lib/docs/mdx-plugin-options.ts`. `createDocsMdxPlugins({ remarkPlugins, rehypePlugins })` adds your own plugins after the built-in ones.
- Edit `src/public/favicon/site.webmanifest` (`name`, `short_name`) and `SITE_NAME` in `src/lib/docs/site-meta.ts` for your site. The manifest ships as "Docs starter".
- Add pages as `<section>/<slug>.mdx` with frontmatter; reorder with `order` and `DOCS_SECTION_ORDER`.
- Import each JSX component directly in the MDX document that uses it. Use `class="unstyled"` on alerts and other chrome so prose styles do not restyle them.

## Docs chrome

- `RuiSidebar` — section groups from `docsNav`
- `RuiToc` — `h2` / `h3` on the current page
- `RuiBreadcrumb` — resolved server-side from `docsNav` and passed into the docs layout
- Cycle theme toggle — system / light / dark, persisted in `localStorage`
- `CopyForLlm` — fetches `/docs-llm/<section>/<slug>.md` for the current page (path-derived; see LLM exports)
- Previous / next pagination across the flattened docs set, rendered on the server

### Code tabs

`CodeTabs` (`src/components/code-tabs`) renders tabs of highlighted code with a Copy button. Pass inline `{ id, label, code }` tabs from a Page or an MDX file; the server highlights them with the same Shiki themes as fenced blocks (`src/lib/docs/shiki-themes.ts`).

### Diagrams (optional)

Mermaid diagrams render at build time with [Pele](https://www.npmjs.com/package/pele) and are off by default. To turn them on, pass the plugin to the factory and import the stylesheet:

```ts
// src/lib/docs/mdx-plugin-options.ts
import { remarkMermaid } from './remark-mermaid';

export const docsMdxPluginOptions = createDocsMdxPlugins({ remarkPlugins: [remarkMermaid] });
```

```css
/* src/styles/tailwind.css */
@import './components/diagram.css';
```

A fence labelled `mermaid` then becomes inline SVG that follows the light and dark theme. An invalid diagram fails the build with its file and line.

## LLM exports

This template publishes an agent index; it is not a hosted API.

| Surface                         | Role                                               |
| ------------------------------- | -------------------------------------------------- |
| `/llms.txt`                     | Index only (when-to-use, CLI, section links)       |
| `/docs-llm/<section>/<slug>.md` | Raw MDX body for one exported page                 |
| HTML `rel="alternate"`          | Advertises the markdown URL from the docs pathname |

`pnpm run generate:llms` runs before `dev` and `build`. `ContentScanner` reads `src/content/docs`; the script writes `src/public/llms.txt` and **replaces** `src/public/docs-llm/`. Deleted pages and `llms: false` entries are omitted from the index and removed from that tree.

Absolute links in `llms.txt` use `configuredSiteOrigin()` in `src/lib/docs/site-meta.ts` — the same helper `eco.config.ts` sets as `baseUrl`. Set `ECOPAGES_BASE_URL` or change that helper. Do not hardcode a different origin only in `baseUrl`.

HTML alternate tags and Copy for LLM do **not** read `llms`. After generate, an excluded page can still point at a markdown URL that is gone. Treat generator output as the fetch contract.

`sitemap: { enabled: true, extraUrls: ['/llms.txt'] }` writes `sitemap.xml` during `ecopages build` / `preview` only. `ecopages dev` does not serve it.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm run generate:llms
pnpm test
```

Open `/` for the homepage and `/docs/getting-started/introduction` for the first docs page.

## Full docs app

See `apps/docs` for the production docs app: more sections and code tabs.
