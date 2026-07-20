# ADR: Dev client delivery via on-demand transform

## Status

Accepted

## Context

Native `ecopages dev` registers each React page through `registerEntrypoint`, which runs a Rolldown
`browser-hmr` build before SSR can return HTML. That model produced compensating machinery (vendor
prewarm, entrypoint dedupe, disk caches) without fixing first-request latency.

Agora and most apps use `ecopages dev` directly. We are not adopting Vite as the primary dev host.

## Decision

Serve browser modules **on demand** from a core **dev transform server** inside `ecopages dev`.
Production `ecopages build` stays on Rolldown unchanged.

| Layer            | Owner                                      | Responsibility                                                  |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Dev client       | Core transform server                      | Transform/bundle page modules per HTTP request; in-memory cache |
| Dev invalidation | `DevelopmentInvalidationService` + watcher | Invalidate transform cache; signal browser reload               |
| Prod client      | Rolldown unified graph                     | Ship optimized browser assets                                   |

## Consequences

- `registerEntrypoint` in transform mode returns a URL immediately; no blocking Rolldown emit on SSR.
- `browser-hmr`, `HmrEntrypointRegistrar` emit path, and React Rolldown HMR rebuilds are deleted
  after the transform path is proven (Phases 2–3).
- `@ecopages/vite-plugin` remains optional for Vite-hosted apps; it is not the agora path.
- Integrations may register `getDevTransformBundleContributor()` to supply Rolldown plugins for
  owned entrypoints.

## Deletion checklist (Phases 2–4)

- `build/runtime` `browser-hmr` profile — retained for `hmr-runtime` and on-demand dev transform only
- `hmr-entrypoint-registrar` Rolldown emit path — removed for pages/scripts (runtime disk emit only via `buildRuntimeInternal`)
- `ReactHmrStrategy` Rolldown page bundle path (done in Phase 2)
- `dev-browser-script-cache` (removed; in-memory `AssetProcessingService` cache covers dev reuse)
- Legacy `/_hmr/*.js` disk serving for pages and scripts (done in Phase 4; `_hmr_runtime.js` remains)
- `hmr-runtime.ts` bare-import fallback for dev transform modules (Phase 3: transform-first `module-update` client)
- `registerScriptEntrypoint` blocking Rolldown emit (Phase 4: dev transform URLs)
