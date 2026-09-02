# Ecopages Docs

Public documentation app for the framework (ecopages.app). Pages are MDX under `src/content/docs`, rendered by a catch-all route, with Radiant UI chrome for sidebar, TOC, breadcrumb, alerts, and the theme toggle.

The sidebar is uncontrolled (`mobileDefaultOpen={false}`): crossing into the mobile breakpoint closes the drawer without a page-level `rui-sidebar-mobile-change` listener. TOC listeners register only in the browser so server renders do not keep document listeners between pages. Each MDX file imports the interactive components it renders, so client assets stay scoped to pages that use them.

## Local development

```bash
pnpm dev
```

Copy `.env.example` to `.env` and adjust port/base URL if needed.

The docs app deliberately does not prewarm the entire collection in development. Broad route prewarming competes
with interactive navigation for the same page-build pipeline; pages are rendered on demand instead. Client navigation
uses hover-only prefetching so the large sidebar does not fill that same server queue with speculative renders.

## Debugging slow first page load

Docs pages compile client JS on first open in dev. If a page feels slow, use the startup trace to see where time goes.

| Variable                      | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `ECOPAGES_STARTUP_TRACE=true` | Phase timings only — cleanest for perf work                              |
| `ECOPAGES_LOGGER_DEBUG=true`  | Same trace **plus** verbose core/processor logs (`ecopages dev --debug`) |

Example (trace only):

```bash
ECOPAGES_STARTUP_TRACE=true pnpm dev
```

Open a docs URL once, then check the terminal for `[ecopages:startup-trace]` lines. The `summary` row reports first-request SSR time, how many browser bundles ran, and total client JS bytes.

See also [packages/ecopages/README.md](../../packages/ecopages/README.md#debug-logging-and-startup-trace) for full env var reference.

## Agent-facing surface

This app is documentation, not a hosted API. Agents should follow a progressive path:

1. **`/llms.txt`** — index only (when-to-use, CLI, section links). It is not a dump of every page body.
2. **`/docs-llm/<section>/<slug>.md`** — raw MDX body for one page. HTML docs pages advertise that URL as `rel="alternate" type="text/markdown"`.
3. **`/skill.txt`** then **`/skill/SKILL.md`** — task-oriented build guide. Read one reference module, not the whole pack.

`pnpm run generate:llms` runs before `dev` and `build`. The script replaces the generator-owned `src/public/docs-llm/` tree, so deleted pages and `llms: false` entries are not left public. Absolute links in `llms.txt` use `configuredSiteOrigin()` from `src/lib/docs/site-meta.ts` — the same helper `eco.config.ts` passes to `setBaseUrl()`. Change that helper or `ECOPAGES_BASE_URL`; do not hardcode a different origin only in `setBaseUrl()`.

HTML `rel="alternate"` is derived from the page pathname. It does not read the `llms` frontmatter flag. After a generate, an excluded page can still advertise a markdown URL that no longer exists. The generator output is the source of truth for what is fetchable.

`sitemap.xml` is written during `ecopages build` (`extraUrls`: `/llms.txt`, `/skill.txt`). `ecopages dev` does not generate or serve it.
