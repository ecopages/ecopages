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

Escape hatch: `ECOPAGES_DEV_CLIENT_DELIVERY=rolldown` restores the legacy Rolldown HMR path until
Phase 2 deletion removes it.

## Consequences

- `registerEntrypoint` in transform mode returns a URL immediately; no blocking Rolldown emit on SSR.
- `browser-hmr`, `HmrEntrypointRegistrar` emit path, and React Rolldown HMR rebuilds are deleted
  after the transform path is proven (Phases 2–3).
- `@ecopages/vite-plugin` remains optional for Vite-hosted apps; it is not the agora path.
- Integrations may register `getDevTransformBundleContributor()` to supply Rolldown plugins for
  owned entrypoints.

## Deletion checklist (Phases 2–3)

- `build/runtime` `browser-hmr` profile
- `hmr-entrypoint-registrar` Rolldown emit path
- `ReactHmrStrategy` Rolldown bundle path
- `dev-browser-script-cache`
- Legacy `/_hmr/*.js` disk serving (except transition period)
- `hmr-runtime.ts` full-page reload client (replaced by transform HMR client)
