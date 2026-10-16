# Runtime Adapters

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

`createApp()` resolves the config and command-line mode once, then returns the concrete `EcopagesApp`. The app owns route registration and moves through `idle`, `starting`, `ready`, `stopping`, and `stopped` phases. Concurrent `start()` and `fetch()` calls share the app's readiness promise. After `stop()`, a later `start()` or `fetch()` creates a fresh server adapter. The app owns one `NodeServerAdapter`, which binds the Node HTTP host and composes `ServerRequestPipeline` for route handling.

Watch mode creates a `DevSession` after the Node server binds. That session owns the Project Watcher, `HmrManager`, client bridge, background Page prewarm, and the Dev Toolbar runtime. Its single `dispose()` stops those resources before Integration teardown. Production and request-only use do not create a DevSession.

They are responsible for:

- binding and stopping the Node HTTP server
- delegating startup into framework-owned loaders and services
- bridging runtime-specific request/response or HMR transport details
- keeping host/runtime transport details out of generic core orchestration

Shutdown cancels queued Page prewarming, waits for active prewarm renders and for Integration `setup()` calls still in flight, then calls `teardown()` for activated Integrations and clears their activation state. Cleanup attempts each resource even when an earlier step fails, then reports the errors. This releases runtime resources such as Lit workers after background renders finish using them.

If shutdown rejects while a standalone development restart is stopping the server, the adapter logs the rejection details, including nested cleanup errors and their causes, and still exits with the restart code: the process ends either way, and the CLI starts a fresh server.

They are not responsible for:

- deciding plugin lifecycle ordering
- owning server-module semantics
- owning browser bundling policy
- owning route rendering semantics

## Main Areas

- `node/`: `EcopagesApp`, concrete `NodeServerAdapter`, watch-only `DevSession`, HTTP request bridge, and HMR transport
- `shared/`: runtime-neutral adapter helpers, clustered by concern:
    - `shared/http/` — API response builders, the shared `serveDistFile()` request handler, middleware runner, define-api helpers, explicit-static and filesystem matchers. The dist handler owns file lookup, path validation, HEAD and 405 behavior, ETags, conditional 304, gzip negotiation, and `Cache-Control` for both the runtime fallback and preview. In watch mode stable non-HTML files use `no-cache`; in production only recorded content-hashed outputs are `immutable`, and `.html` and every other file is revalidated (`public, max-age=0, must-revalidate`). A `.gz` variant is sent only to a client that accepts gzip, and any gzip-eligible file that has one carries `Vary: Accept-Encoding`. `FileSystemServerResponseFactory` only wraps rendered route and error-page bodies.
    - `shared/hmr/` — HMR HTML inject helpers, concrete `HmrManager`, and entrypoint registrar. `HmrManager` assigns `appRuntime.hmr` for the dev session, owns per-session script entrypoint change handlers (`onScriptEntrypointChanged`), and clears both on `stop()`. Missing-file events are skipped and their entrypoint registrations are cleared. In watch mode every HTML response is marked `no-store`
- `shared/runtime/` — `ServerRequestPipeline`, route handler, static builder, port/bootstrap utilities (`PortManager` on dev and preview bind, Clack confirm on TTY port collisions), and the public asset copy helper used at startup, during static export, and by the watcher. Preview binds `serveDistFile()` through the same `RuntimeHost` transport used by the app server. Before `EcopagesApp.start()` reports readiness, watch mode waits for best-effort Integration warmup attempts and the watcher's initial filesystem subscription; all warmup attempts settle before failures are logged. Non-watch network startup activates Integrations before releasing request readiness, while request-only `app.fetch()` activates only Integrations used by the request. Declared prewarm paths (`devPrewarmPaths`, including those Processors append in `setup()`) are de-duplicated and rendered in the background without delaying readiness; a path that fails to render is skipped and logged at debug level.
    - `shared/ws/` — WinterCG WebSocket lifecycle helpers and Node HTTP upgrade bridge

## Ownership Boundary

The adapter layer is transport-oriented.

Core services still own:

- config finalization
- build-manifest assembly
- server loading
- invalidation classification
- route rendering orchestration

Semantic 404/500 page selection and rendering belongs to `src/services/error-pages/`; adapters only turn its rendered body into runtime responses.

## Shared Request Contracts

- API handler errors and errors that escape `ServerRequestPipeline.handleSharedRequest` resolve through `ApiRequestPipeline.handleError`: a thrown `Response`, then a client abort (499), then `app.onError`, then `HttpError`, then a 500 logged with its stack. `app.fetch()` therefore always resolves with a `Response`. Page render failures render the error page instead and do not reach `app.onError`.
- On Node, `attachNodeHttpWebSocketUpgrades` owns the unmatched-upgrade policy. `/_hmr` (dev only) and user routes are handled; anything else is destroyed.
- HMR endpoints follow the `dev` flag only.
