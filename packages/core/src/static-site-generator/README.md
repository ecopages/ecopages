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

| File                                        | Role                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `static-site-generator.ts`                  | Route enumeration, HTML artifact writes, integration export hooks, sitemap   |
| `static-export-context.ts`                  | Hook context type for `beforeStaticExport` / `afterStaticExport`             |
| `sitemap.ts`                                | Pure sitemap.xml renderer                                                    |
| `sitemap-routes.ts`                         | Sitemap location assembly (`exclude`, `extraUrls`, dedupe)                   |
| `static-build-invalidation.ts`              | `dist/` reset policy, production cache clearing, static-render cache context |
| `production-page-browser-graph-prebuild.ts` | Warms and prebuilds browser asset graphs before static export rendering      |

Build-input fingerprinting (`hashAppConfigFile`, `createBuildInputsFingerprint`, `hashWatchedBuildInputs`) lives in `packages/core/src/build/cache/build-input-fingerprint.ts` and is shared with the unified-graph and route-module in-process caches. `hashAppConfigFile` hashes the config module and the project files it imports (`absolutePaths.configModuleFiles`).

## Incremental static export

`ServerStaticBuilder.prepareExportDirectory()` decides whether to wipe `dist/`:

1. `force: true` → always reset, and clear leftover on-disk manifests plus in-process caches
2. A watched rendering input changed (`haveWatchedBuildInputsChanged()`) → reset, and clear leftover on-disk manifests plus in-process caches
3. Any processor/integration reports `didChange()` → reset
4. This process has not yet recorded matching `configHash`, `buildInputsFingerprint`, and `watchedInputsHash` → reset. A new process always takes this branch.

Watched rendering inputs are the files under each Processor's `watch.paths` (filtered by `watch.extensions`), hashed once per export by `hashWatchedBuildInputs()` and passed to `StaticSiteGenerator.run()`. They cover content a page reads without importing it statically, such as content collection entries loaded through dynamic `import()`. Compiled route modules and the unified pages graph track only static imports, so a change to these files also clears those in-process caches; the next export recompiles every route module. `additionalWatchPaths` is not a build input: route-module hashing already covers sources pages import.

When `dist/` is preserved (`preserveExportDirectory: true`), `StaticSiteGenerator.run()` prunes HTML files no longer in the active route set.

Rendered HTML reuse is in-process only. `canReuseStaticRender()` skips re-rendering when the source file, dependency hashes, and output path are unchanged in this process. Rebuilding a route module (`recordBuild()`) drops `renderedOutputs` so a layout or component edit cannot keep the previous HTML. A later `ecopages build` renders every page again.

`clearProductionBuildCaches()` runs on `force` builds and after a watched rendering input changes. It deletes leftover `.eco` `.build-cache.json` files from earlier releases and resets in-process route-module and unified-graph state.

## Integration hooks

Integrations may implement:

- `beforeStaticExport(context)` — runs after unified-graph prebuild, before page rendering
- `afterStaticExport(context)` — runs in a `finally` block after generation completes

When `appConfig.sitemap.enabled` is true, `sitemap.xml` is written **after** `afterStaticExport` so integration-generated URLs can be listed via `extraUrls`. Development (`ecopages dev`) does not emit this file.

Sitemap eligibility is decided during successful page export (`activeStaticPathnames` plus `robots.index !== false`, fail-closed on metadata errors). `resolveSitemapLocations` then applies `exclude` and appends `extraUrls`.

`StaticExportContext.routes` is the unfiltered static-generation route list. Sitemap filtering is applied separately.

See `StaticExportContext` in `static-export-context.ts`.

User-facing guide: [Sitemap](https://github.com/ecopages/ecopages/blob/main/apps/docs/src/content/docs/core/sitemap.mdx) in the docs app.
