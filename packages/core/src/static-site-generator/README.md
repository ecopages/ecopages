# Static Site Generation

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

Semantic error pages are excluded from ordinary page enumeration and emitted once by `services/error-pages/semantic-error-page-exporter.ts`, so runtime and static output share source precedence and rendering behavior.

## Files

| File                                        | Role                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `static-site-generator.ts`                  | Route enumeration, HTML artifact writes, integration export hooks, sitemap |
| `static-export-context.ts`                  | Hook context type for `beforeStaticExport`                                 |
| `sitemap.ts`                                | Pure sitemap.xml renderer                                                  |
| `sitemap-routes.ts`                         | Sitemap location assembly (`exclude`, `extraUrls`, dedupe)                 |
| `production-page-browser-graph-prebuild.ts` | Warms and prebuilds browser asset graphs before static export rendering    |

## Export directory

`ServerStaticBuilder.prepareExportDirectory()` empties `dist/`, copies the public directory into it, and marks runtime assets for rebuilding. Every build renders every page from source in a fresh process, so nothing in an earlier `dist/` is reused and no HTML is skipped or pruned. Route-module transpile and the unified pages graph are reused in memory only, within the current process.

## Integration hooks

Integrations may implement:

- `beforeStaticExport(context)` — runs after unified-graph prebuild, before page rendering

Core calls no Integration hook after generation.

When `appConfig.sitemap.enabled` is true, `sitemap.xml` is written **after** every page, so a file an Integration writes during export can be listed through `extraUrls`. Development (`ecopages dev`) does not emit this file.

Sitemap eligibility is decided during successful page export (`activeStaticPathnames` plus `robots.index !== false`, fail-closed on metadata errors). `resolveSitemapLocations` then applies `exclude` and appends `extraUrls`.

`StaticExportContext.routes` is the unfiltered static-generation route list. Sitemap filtering is applied separately.

See `StaticExportContext` in `static-export-context.ts`.

User-facing guide: [Sitemap](https://github.com/ecopages/ecopages/blob/main/apps/docs/src/content/docs/core/sitemap.mdx) in the docs app.
