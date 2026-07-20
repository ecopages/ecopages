# Dev Transform Server

Core-owned on-demand client module delivery for native `ecopages dev`.

## Purpose

Serve browser modules on demand during development instead of blocking SSR on upfront Rolldown `browser-hmr` emits. Production `ecopages build` stays on the Rolldown unified graph path unchanged.

## Layer ownership

| Layer            | Owner                                      | Responsibility                                                  |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Dev client       | `DevTransformServer` (`transform-server/`) | Transform/bundle page modules per HTTP request; in-memory cache |
| Dev invalidation | `DevelopmentInvalidationService` + watcher | Invalidate transform cache; signal browser reload               |
| Prod client      | Rolldown unified graph                     | Ship optimized browser assets                                   |

## Key modules

- `transform-server/dev-transform-server.ts` — registers modules, serves cached bundles, deduplicates in-flight transforms
- `transform-server/dev-transform-bundler.ts` — Rolldown invocation for on-demand bundles
- `transform-server/dev-transform-url.ts` — stable `/_dev-transform/` URL prefix

Integrations may register `getDevTransformBundleContributor()` to supply Rolldown plugins for owned entrypoints.

## HMR integration

`SharedHmrManager` owns one `DevTransformServer` per app. `DevTransformEntrypointRegistry` tracks registered entrypoints for invalidation. See [`../hmr/README.md`](../hmr/README.md).

`@ecopages/vite-plugin` remains optional for Vite-hosted apps; native CLI dev uses this transform path.
