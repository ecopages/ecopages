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

`ecopages:dev-server` starts the embedded app for each Vite server instance:

1. Register the host module loader
2. Load the `app` module export through `ssrLoadModule`
3. Call `app.handleListening()` with the dev-server origin
4. Attach the app's WebSocket upgrades to Vite's HTTP server

Each Vite server instance loads its own app, and middleware awaits it before serving requests. The app is stopped when its Vite server closes (the plugin's `closeBundle` hook), including on a restart and in middleware mode.

## Dev invalidation and HMR

The embedded app's Project Watcher owns dev invalidation and HMR: `DevelopmentInvalidationService` in `@ecopages/core` plans each change, and the app's HMR manager updates the browser through the Ecopages HMR runtime. Vite invalidates its client and SSR module graphs on every file change by itself, so pages, layouts, includes and views, which core loads per request, pick up edits on the next request.

Nothing re-imports the app entry, so `ecopages:dev-server` restarts Vite when `app.ts` or a module it imports changes (API, route and WebSocket handlers, data they read), and logs the file. The restart loads a fresh app and stops the old one. While the app has failed to load, any added, changed or deleted file restarts Vite, so fixing the error recovers without a manual restart. A request in flight during a restart can fail once; the next one is served by the new app.

Known gaps: with the host owning the dev client, the Project Watcher does not send browser reloads, so edits under `publicDir` and `additionalWatchPaths` need a manual reload (#458), and edits to `eco.config.ts` or `.env` only log a warning (#434).

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
