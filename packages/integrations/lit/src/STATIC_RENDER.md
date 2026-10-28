# Lit static render worker

Lit-first page routes (`.lit.tsx`) render through a dedicated worker thread during static export. Serving (`ecopages start` and `ecopages dev`) renders every Lit Page in-process; `setup()` does not start a worker.

## Flow

```
Main thread                          Worker thread
───────────                          ─────────────
LitPlugin.setup()
  └─ no worker

Serving: IntegrationRenderer.execute()
  └─ getRenderSession() is unset
       └─ remote hook declines; core renders in-process
          Lit's preload hook uses the in-process preloader

staticExport
  └─ LitStaticRenderSession.ensureWorker()
       └─ LitStaticRenderWorkerClient.start()
            └─ postMessage(init) ──► setupAppRuntimePlugins()
                                     setupAppRuntimeIntegrations()
                                     RouteRendererFactory
  └─ preloadStaticRoutes()
       └─ preload SSR lazy scripts for Lit pages
  └─ IntegrationRenderer.execute() (main)
       └─ getRenderSession()
            ├─ locals or explicit props ─► remote hook declines; core renders in-process
            └─ session.renderPageInWorker()
                 └─ postMessage(render) ─────► RouteRendererFactory.execute()
                                               (no active session in worker)
                                               Lit's preload hook uses
                                               importServerModule (no entrypoint resolver)
  └─ returns a release that disposes the session once the export ends
```

`ECOPAGES_LIT_STATIC_RENDER_WORKER=true` in the worker environment skips processor `.setup()` inside `setupAppRuntimePlugins` (the main thread already prepared artifacts). Integration setup still runs in the worker isolate before `RouteRendererFactory` creates route renderers. That processor skip stays necessary because the worker still bootstraps a second app during export.

## Ownership

| Concern                    | Owner                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session + worker lifecycle | `LitPlugin` (`renderSession`), started only from `staticExport()`                                                                                                      |
| Lazy session lookup        | `createLitRenderer()` hook factory via `getRenderSession`                                                                                                              |
| Worker identity            | First `{ configModulePath, runtimeOrigin }` passed to `ensureWorker`; same identity is sticky; a later `ensureWorker` with a different identity disposes and recreates |

`staticExport` requires `appConfig.absolutePaths.config` and starts the worker with `context.baseUrl`. Its release disposes the session and clears `renderSession`, so an in-process export leaves no worker thread; serving never had one.

## Locals policy

When `RouteRendererOptions.locals` or `RouteRendererOptions.props` is present, the Lit remote-render hook declines the worker path and core continues in-process. Request locals are not sent through the worker protocol (structured-clone risk and request-scoped data), and explicit props are not passed because the worker re-imports the route module. Static export uses the worker only for eligible Lit page routes without locals or explicit props; explicit static views continue in-process.

## Files

| File                                 | Role                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `lit-static-render-session.ts`       | Plugin-runtime-scoped session: worker lifecycle + SSR preload   |
| `lit-static-render-worker-client.ts` | Message protocol client                                         |
| `lit-static-render-worker.ts`        | Worker entry (exported as `@ecopages/lit/static-render-worker`) |
| `lit-static-render-protocol.ts`      | Request/response message types                                  |
| `lit-static-render-error.ts`         | Error to message and back, keeping an `HttpError` status        |

## Protocol

| Message             | Direction     | Purpose                                                                                                                                                                     |
| ------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | main → worker | Load the app config module (`configModulePath`, usually `eco.config.ts` in development and `dist/server/eco.config.mjs` in production), bootstrap runtime (`runtimeOrigin`) |
| `ready`             | worker → main | Worker initialized                                                                                                                                                          |
| `render`            | main → worker | Render one Lit page route (`filePath`, `PageParams`, optional `PageQuery`)                                                                                                  |
| `result` / `error`  | worker → main | HTML body plus optional `cacheStrategy`, `sourceDependencyPaths` and resolved `metadata`, or an error message (with the status of a thrown `HttpError`)                     |
| `shutdown`          | main → worker | Wait for active renders, tear down activated Integrations, and close the worker message port                                                                                |
| `shutdown-complete` | worker → main | Confirm Integration teardown completed; the client waits for worker exit and force-terminates after timeout                                                                 |
