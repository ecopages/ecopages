# Static Site Generation

**Layer:** Rendering.

This directory contains the static-build execution path used when Ecopages renders pages ahead of time.

## Purpose

The static-site generator reuses the same app-owned config, route matching, and rendering services that development and preview flows use, but drives them in a build-oriented loop.

It is responsible for:

- enumerating renderable routes
- rendering static outputs through the normal rendering pipeline
- respecting route-level constraints such as cache policy and unsupported dynamic server-only paths
- emitting semantic 404/500 artifacts through the shared error-page renderer

## Design Rule

Static generation should follow the same ownership model as runtime rendering.

That means it should reuse:

- built app config
- route matching
- render orchestration
- asset processing

It should not invent a parallel rendering stack just for build mode.

Static export uses the same CPU-based concurrency limit as the build queue, and the startup trace reports that limit.

A Page's output file depends only on its route and its own source file, never on sibling Pages. `/` is `index.html`. A Page whose source file is named `index` (`pages/blog/index.tsx`, `pages/docs/[slug]/index.tsx`) writes `<route>/index.html`, and any other Page (`pages/blog.tsx`, `[slug].tsx`) writes `<route>.html`. Explicit static routes and semantic error pages have no filesystem source and write `<route>.html`. Static serving and `ecopages start` resolve `/blog` to `blog.html` first, then `blog/index.html`, so both layouts are served.

Semantic error pages are excluded from ordinary page enumeration and emitted once by `route-renderer/error-pages/semantic-error-page-exporter.ts`, so runtime and static output share source precedence and rendering behavior.

## Files

| File                                        | Role                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `static-site-generator.ts`                  | Route enumeration, HTML artifact writes, integration export hooks, sitemap                            |
| `static-export-context.ts`                  | Context and release types for `staticExport`                                                          |
| `sitemap.ts`                                | Pure sitemap.xml renderer                                                                             |
| `sitemap-routes.ts`                         | Sitemap location assembly (`exclude`, `extraUrls`, dedupe)                                            |
| `production-page-browser-graph-prebuild.ts` | Collects renderer plans, writes the asset ledger after the app-wide build, and prebuilds route graphs |

## Export directory

`ServerStaticBuilder.prepareExport()` empties the configured output directory and copies public files into `dist/client/`, marks runtime assets for rebuilding and sets Processors up. Production emit activates Integrations before importing those modules; generation then reuses that activation. The Node adapter calls it during initialization, before the router reads any Page, and `build()` prepares the export itself only when nothing did. Every build starts from an empty `dist/`, so nothing in an earlier export is reused and no HTML is skipped or pruned. Production emits server modules into `dist/server/` before generation and imports them while rendering. Route-module transpile reuse stays in memory only during development, within the current process. Before rendering, production prebuild plans every renderer's routes, gathers their scripts and the HTML shell module scripts into compatible app-wide browser build groups, records each entry's output in the asset ledger under the dependency keys that declared it, prepares every planned route so the ledger records each dependency it is served with, and writes `dist/server/processed-assets.json`. It plans a parameter-free instance for every non-exact Page route template (endpoint routes are skipped) and every view the server entry imports, without calling `staticProps` or metadata hooks for missing params, a per-entry plan for every Dynamic Page that declares `staticPaths`, and a plan for every `app.static` route instance (each `staticPaths` entry of a dynamic explicit path; its `staticPaths` runs once, before prebuild). Those entries run `staticProps` so prop-dependent Dependencies are built during `ecopages build`. `ecopages start` from a complete `dist/` restores and seals the ledger and plans nothing. A request resolves every dependency through the ledger; one it does not record is an error asking for `ecopages build` again, and nothing is compiled or written. A generation failure clears the ledger file so a later start cannot use a partial build.

Filesystem and explicit Page render failures are logged with their route and stack. By default, Core finishes the remaining routes and sitemap, releases export resources, then fails the build with all page failures; `ecopages build` exits with status 1. `ecopages build --keep-going` keeps the earlier log-and-continue behavior and exits successfully, leaving failed Pages out of the export.

## Integration hooks

Integrations may implement:

- `staticExport(context)` — runs after production server-module emit, before page rendering. It may return a release function. Core awaits every release in reverse order once the export ends, including when it fails or an Integration listed later throws from `staticExport`, so a worker started for the export stops with it: `ecopages build` ends by itself and no longer calls `process.exit()`. A release that throws is logged and does not fail the export.

Core calls no other Integration hook around generation.

When `appConfig.sitemap.enabled` is true, `sitemap.xml` is written **after** every page, so a file an Integration writes during export can be listed through `extraUrls`. Development (`ecopages dev`) does not emit this file.

Sitemap `<loc>` values resolve against `appConfig.baseUrl` (config `baseUrl`, `ECOPAGES_BASE_URL` or `--base-url`), never the serve origin, so `ECOPAGES_PORT` does not change them.

Sitemap eligibility uses the metadata returned by the successful route render (`activeStaticPathnames` plus `robots.index !== false`, fail-closed when render metadata is unavailable). It does not load the route or rerun its `staticProps` and metadata hooks after writing the page. `resolveSitemapLocations` then applies `exclude` and appends `extraUrls`.

`StaticExportContext.routes` is the unfiltered static-generation route list. Sitemap filtering is applied separately.

See `StaticExportContext` in `static-export-context.ts`.

User-facing guide: [Sitemap](https://github.com/ecopages/ecopages/blob/main/apps/docs/src/content/docs/core/sitemap.mdx) in the docs app.
