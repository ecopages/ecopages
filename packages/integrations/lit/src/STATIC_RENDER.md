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

LitPlugin.initializeRenderer()
  └─ LitRenderer({ getRenderSession })   lazy accessor (not constructor snapshot)

LitRenderer.execute() (main)
  └─ ensureIntegrationRuntimeActivated()
  └─ getRenderSession()
       ├─ locals present ──────────► super.execute() (in-process)
       └─ session.renderPageInWorker()
            └─ postMessage(render) ─────► RouteRendererFactory.execute()
                                          (no active session in worker)

beforeStaticExport
  └─ ensureWorker() (recreate if identity changed)
  └─ preloadStaticRoutes()
       └─ preload SSR lazy scripts for Lit pages
```

`ECOPAGES_LIT_STATIC_RENDER_WORKER=true` in the worker environment prevents nested worker creation during `LitPlugin.setup()` and skips processor `.setup()` inside `setupAppRuntimePlugins` (main thread already prepared artifacts).

## Ownership

| Concern                    | Owner                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Session + worker lifecycle | `LitPlugin` (`renderSession`)                                                                      |
| Lazy session lookup        | `LitRenderer` via `getRenderSession`                                                               |
| Worker identity            | First `{ configModulePath, runtimeOrigin }`; same identity is sticky; different identity recreates |

Renderers created before plugin `setup()` still use the worker after setup assigns the session, because `execute` activates the integration runtime then reads the accessor.

## Locals policy

When `RouteRendererOptions.locals` is present, `LitRenderer.execute` forces the in-process path (`super.execute`). Request locals are not sent through the worker protocol (structured-clone risk and request-scoped data). Static export and routes without locals continue through the worker.

## Files

| File                                 | Role                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `lit-static-render-session.ts`       | Plugin-runtime-scoped session: worker lifecycle + SSR preload   |
| `lit-static-render-worker-client.ts` | Message protocol client                                         |
| `lit-static-render-worker.ts`        | Worker entry (exported as `@ecopages/lit/static-render-worker`) |
| `lit-static-render-protocol.ts`      | Request/response message types                                  |

## Protocol

| Message            | Direction     | Purpose                                                                       |
| ------------------ | ------------- | ----------------------------------------------------------------------------- |
| `init`             | main → worker | Load `eco.config.ts`, bootstrap runtime (`configModulePath`, `runtimeOrigin`) |
| `ready`            | worker → main | Worker initialized                                                            |
| `render`           | main → worker | Render one Lit page route (`filePath`, `PageParams`, optional `PageQuery`)    |
| `result` / `error` | worker → main | HTML body plus optional `cacheStrategy`, or an error message                  |
| `shutdown`         | main → worker | Exit worker thread                                                            |
