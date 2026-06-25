# @ecopages/vite-plugin architecture notes

This document captures implementation decisions, extension points, and follow-up research for the Ecopages Vite adapter.

## Plugin composition

`ecopages()` returns an ordered array of dev-only plugins. Order matters because later plugins assume earlier transforms and config mutations are already in place.

| Order | Plugin                       | Responsibility                                                           |
| ----- | ---------------------------- | ------------------------------------------------------------------------ |
| 1     | `ecopages:client-jsx-compat` | `enforce: 'pre'` host JSX pragma for non-host integrations on the client |
| 2     | `ecopages:config`            | Vite config merge + renderer module context + dev-server origin sync     |
| 3     | `ecopages:metadata`          | `eco-component-meta` transform                                           |
| 4+    | dynamic source transforms    | Bundler-neutral transforms from `appConfig.sourceTransforms`             |
| N     | `ecopages-virtual-modules`   | Integration manifest, island registry, image bridge                      |
| N+1   | `ecopages:islands`           | Island client runtime virtual module                                     |
| N+2   | `ecopages:hot-update`        | Watcher + invalidation bridge                                            |
| last  | `ecopages:dev-server`        | Connect middleware → `app.fetch()`                                       |

All buckets use `apply: 'serve'` because this package is intentionally a dev-host adapter. Production builds stay in the Ecopages CLI / Rolldown path.

## Dev-server origin

The Vite plugin mirrors the Ecopages CLI `resolveServeRuntimeOrigin` behavior:

- `ecopages:config` resolves the active Vite origin in `configResolved`
- `ecopages:dev-server` builds middleware `Request` objects from that origin
- `appConfig.baseUrl` is synchronized to the resolved origin for runtime consumers

This prevents stale `http://localhost:3000` defaults from leaking into Vite-hosted apps that actually run on another port.

## HTML pipeline

SSR HTML from `app.fetch()` is normalized in middleware for Ecopages-specific concerns (Lit slot unwrapping, template slot injection), then passed through `server.transformIndexHtml()` so Vite owns `/@vite/client` injection and related dev HTML transforms.

Manual `/@vite/client` string injection in middleware is deprecated. Keep Ecopages-specific HTML rewrites in `html-transforms.ts`; keep Vite-owned injection on the Vite HTML transform path.

## Dev-host warmup

`ecopages:dev-server` warms the SSR graph before meaningful browser traffic:

1. Register the host module loader
2. Load and cache the `app` module export
3. Preload `virtual:ecopages/images.ts` when available
4. Run an internal `app.fetch('/')` smoke request

Middleware awaits `api.getDevHostReady()` before serving requests. The cached app is cleared when `ecopages:hot-update` invalidates server modules so the next request reloads `app` via `ssrLoadModule`.

## HMR boundaries (Solid comparison)

Solid's `vite-plugin-solid` keeps HMR concerns in a dedicated `solid-refresh.ts` bucket and aims for component-level fast refresh. Ecopages takes a different path:

| Layer               | Ecopages                                             | Solid                                 |
| ------------------- | ---------------------------------------------------- | ------------------------------------- |
| Invalidation policy | `DevelopmentInvalidationService` in `@ecopages/core` | Plugin-local refresh runtime          |
| Vite bridge         | `ecopages:hot-update`                                | `handleHotUpdate` / refresh runtime   |
| Granularity         | Often full reload for route/layout changes           | Component-level updates when possible |

**Current mapping**

- Page/layout/component/include edits → planned by `DevelopmentInvalidationService`
- Server module invalidation → non-client Vite environments in `ecopages:hot-update`
- Browser reload → debounced `server.hot.send({ type: 'full-reload' })` (~200ms coalescing window) when the plan requires it, deferred until dev-host warmup completes
- Delegated module invalidation → invalidate client modules and return them to Vite HMR without a full reload

**Follow-up opportunity**

Expose per-integration `HmrStrategy` boundaries from `IntegrationPlugin` so integrations with true fast-refresh runtimes (React, future Solid host pages) can opt into finer-grained updates without teaching file-category rules to the Vite plugin.

## Astro-style Vite injection evaluation

Astro integrations inject Vite plugins through `astro:config:setup({ updateConfig })`. Ecopages already has a higher-level analogue:

- integrations register through `IntegrationPlugin` and `eco.config`
- bundler-neutral transforms adapt to Vite through `EcoSourceTransform`
- the Vite plugin composes the final plugin array

**Recommendation:** do not add a public `onViteSetup` hook yet. The current surface is enough for first-party integrations, and a premature hook would duplicate `eco.config` unless it is scoped narrowly to:

```ts
onViteSetup({ addPlugin, mergeConfig }) {
  mergeConfig({ optimizeDeps: { include: ['some-package'] } });
  addPlugin(myViteOnlyPlugin());
}
```

Revisit once a third-party integration actually needs Vite-only behavior that cannot be expressed as a bundler-neutral `EcoSourceTransform`.

## Comparative positioning

- **Solid:** single focused transform plugin
- **Astro:** framework integration layer above Vite
- **TanStack Start:** composed plugin array with virtual modules and SSR buckets
- **Ecopages:** thin dev adapter over bundler-neutral core, with production build owned by CLI/Rolldown

The Ecopages Vite package should stay dev-only and composable rather than growing into a second production bundler entrypoint.
