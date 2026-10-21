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

Semantic error pages are excluded from ordinary page enumeration and emitted once by `route-renderer/error-pages/semantic-error-page-exporter.ts`, so runtime and static output share source precedence and rendering behavior.

## Files

| File                                        | Role                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `static-site-generator.ts`                  | Route enumeration, HTML artifact writes, integration export hooks, sitemap                         |
| `static-export-context.ts`                  | Context and release types for `staticExport`                                                       |
| `sitemap.ts`                                | Pure sitemap.xml renderer                                                                          |
| `sitemap-routes.ts`                         | Sitemap location assembly (`exclude`, `extraUrls`, dedupe)                                         |
| `production-page-browser-graph-prebuild.ts` | Collects renderer plans, persists the app-wide browser client manifest, and prebuilds route graphs |

## Export directory

`ServerStaticBuilder.prepareExport()` empties `dist/`, copies the public directory into it, marks runtime assets for rebuilding and sets Processors up; Integrations are set up when generation starts. The Node adapter calls it during initialization, before the router reads any Page, and `build()` prepares the export itself only when nothing did. Every build renders every page from source in a fresh process, so nothing in an earlier `dist/` is reused and no HTML is skipped or pruned. Route-module transpile and the unified pages graph are reused in memory only, within the current process. Before rendering, production prebuild gathers grouped browser entries from every renderer and the HTML shell module scripts into compatible app-wide browser build groups, associates entry assets with the routes that use them, and writes `.server/browser-client-manifest.json`. It also writes a parameter-free plan for every non-exact Page route template (endpoint routes are skipped) without calling `staticProps` or metadata hooks for missing params. `ecopages start` restores those plans and their browser assets before accepting SSR requests, so a later product slug can reuse the app-wide output when its grouped browser dependencies and page-client entries match the template. A request with a new dependency graph keeps the request-time browser build path. A generation failure clears the manifest so a later start cannot use a partial build.

Filesystem and explicit Page render failures are logged with their route and stack. By default, Core finishes the remaining routes and sitemap, releases export resources, then fails the build with all page failures; `ecopages build` exits with status 1. `ecopages build --keep-going` keeps the earlier log-and-continue behavior and exits successfully, leaving failed Pages out of the export.

## Integration hooks

Integrations may implement:

- `staticExport(context)` — runs after unified-graph prebuild, before page rendering. It may return a release function. Core awaits every release in reverse order once the export ends, including when it fails or an Integration listed later throws from `staticExport`, so a worker started for the export stops with it: `ecopages build` ends by itself and no longer calls `process.exit()`. A release that throws is logged and does not fail the export.

Core calls no other Integration hook around generation.

When `appConfig.sitemap.enabled` is true, `sitemap.xml` is written **after** every page, so a file an Integration writes during export can be listed through `extraUrls`. Development (`ecopages dev`) does not emit this file.

Sitemap eligibility uses the metadata returned by the successful route render (`activeStaticPathnames` plus `robots.index !== false`, fail-closed when render metadata is unavailable). It does not load the route or rerun its `staticProps` and metadata hooks after writing the page. `resolveSitemapLocations` then applies `exclude` and appends `extraUrls`.

`StaticExportContext.routes` is the unfiltered static-generation route list. Sitemap filtering is applied separately.

See `StaticExportContext` in `static-export-context.ts`.

User-facing guide: [Sitemap](https://github.com/ecopages/ecopages/blob/main/apps/docs/src/content/docs/core/sitemap.mdx) in the docs app.
