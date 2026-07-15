# Lit static render worker

Lit-first page routes (`.lit.tsx`) render through a dedicated worker thread during static export and runtime when the Lit plugin is active.

## Flow

```
Main thread                          Worker thread
───────────                          ─────────────
LitPlugin.setup()
  └─ LitStaticRenderSession.ensureWorker()
       └─ LitStaticRenderWorkerClient.start()
            └─ postMessage(init) ──► setupAppRuntimePlugins()
                                     installBuildRuntime()
                                     RouteRendererFactory

LitRenderer.execute() (main)
  └─ session.renderPageInWorker()
       └─ postMessage(render) ─────► RouteRendererFactory.execute()
                                     (no active session in worker)

beforeStaticExport
  └─ preloadStaticRoutes()
       └─ preload SSR lazy scripts for Lit pages
```

`ECOPAGES_LIT_STATIC_RENDER_WORKER=true` in the worker environment prevents nested worker creation during `LitPlugin.setup()` and skips processor `.setup()` inside `setupAppRuntimePlugins` (main thread already prepared artifacts).

## Files

| File                                 | Role                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `lit-static-render-session.ts`       | Plugin-runtime-scoped session: worker lifecycle + SSR preload   |
| `lit-static-render-worker-client.ts` | Message protocol client                                         |
| `lit-static-render-worker.ts`        | Worker entry (exported as `@ecopages/lit/static-render-worker`) |
| `lit-static-render-protocol.ts`      | Request/response message types                                  |

`LitPlugin.initializeRenderer()` injects the session into `LitRenderer`. There is no process-global coordinator.

## Protocol

| Message            | Direction     | Purpose                                                            |
| ------------------ | ------------- | ------------------------------------------------------------------ |
| `init`             | main → worker | Load `eco.config.ts`, bootstrap runtime                            |
| `ready`            | worker → main | Worker initialized                                                 |
| `render`           | main → worker | Render one Lit page route (`filePath`, `params`, optional `query`) |
| `result` / `error` | worker → main | HTML body plus optional `cacheStrategy`, or an error message       |
| `shutdown`         | main → worker | Exit worker thread                                                 |
