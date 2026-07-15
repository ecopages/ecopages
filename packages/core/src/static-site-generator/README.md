# Static Site Generation

This directory contains the static-build execution path used when Ecopages renders pages ahead of time.

## Purpose

The static-site generator reuses the same app-owned config, route matching, and rendering services that development and preview flows use, but drives them in a build-oriented loop.

It is responsible for:

- enumerating renderable routes
- rendering static outputs through the normal rendering pipeline
- respecting route-level constraints such as cache policy and unsupported dynamic server-only paths

## Design Rule

Static generation should follow the same ownership model as runtime rendering.

That means it should reuse:

- built app config
- route matching
- render orchestration
- asset processing

It should not invent a parallel rendering stack just for build mode.

## Files

| File                           | Role                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `static-site-generator.ts`     | Route enumeration, HTML artifact writes, integration export hooks            |
| `static-export-context.ts`     | Hook context type for `beforeStaticExport` / `afterStaticExport`             |
| `static-build-invalidation.ts` | `dist/` reset policy, production cache clearing, static-render cache context |

Build-input fingerprinting (`hashAppConfigFile`, `createBuildInputsFingerprint`) lives in `packages/core/src/build/cache/build-input-fingerprint.ts` and is shared with server-entry and unified-graph caches.

## Incremental static export

`ServerStaticBuilder.prepareExportDirectory()` decides whether to wipe `dist/`:

1. `force: true` → always reset
2. Any processor/integration reports `didChange()` → reset
3. Route-module manifest lacks matching `configHash` + `buildInputsFingerprint` → reset

When `dist/` is preserved (`preserveExportDirectory: true`), `StaticSiteGenerator.run()` prunes HTML files no longer in the active route set.

Rendered HTML reuse is tracked in `.eco/.server-modules/.build-cache.json` under each route module's `renderedOutputs`. `canReuseStaticRender()` skips re-rendering when the source file, dependency hashes, and output path are unchanged.

`clearProductionBuildCaches()` runs on `force` builds and removes all persisted `.eco` build manifests (route modules, server entry, unified pages graph).

## Integration hooks

Integrations may implement:

- `beforeStaticExport(context)` — runs after unified-graph prebuild, before page rendering
- `afterStaticExport(context)` — runs in a `finally` block after generation completes

See `StaticExportContext` in `static-export-context.ts`.
