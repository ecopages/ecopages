# Runtime Adapters

**Layer:** Application assembly.

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

`createApp()` resolves the config and command-line mode once, then returns the concrete `EcopagesApp`. The app owns route registration and moves through `idle`, `starting`, `ready`, `stopping`, and `stopped` phases. Concurrent `start()` and `fetch()` calls share the app's readiness promise. `stop()` during startup lets the step in flight finish, ends startup there, and releases what it created, including a server that finished binding; the interrupted `start()` resolves without a server, or rejects with the startup error when the step in flight fails, and does not start the app again. After `stop()`, a later `start()` or `fetch()` creates a fresh server adapter. A `start()` or `fetch()` called while `stop()` runs waits for it first; a further `stop()` in that wait cancels it, so the `start()` resolves without a server and the `fetch()` rejects. The app owns one `NodeServerAdapter`, which binds the Node HTTP host and composes `ServerRequestPipeline` for route handling.

Watch mode creates a `DevSession` after the Node server binds. That session owns the Project Watcher, `HmrManager`, client bridge, background Page prewarm, and the Dev Toolbar runtime. Its single `dispose()` stops those resources before Integration teardown. Production and request-only use do not create a DevSession.

They are responsible for:

- binding and stopping the Node HTTP server
- delegating startup into framework-owned loaders and services
- bridging runtime-specific request/response or HMR transport details
- keeping host/runtime transport details out of generic core orchestration

A forced stop, the default, closes every open connection on the Node server, WebSocket connections included (HMR clients and `app.websocket` routes), so it completes while browsers stay connected. `stop(false)` waits for open connections to end on their own.

Shutdown cancels queued Page prewarming, waits for active prewarm renders, in-flight page-cache regenerations, and Integration `setup()` calls still in flight, then calls `teardown()` for activated Integrations and clears their activation state. Cleanup attempts each resource even when an earlier step fails, then reports the errors. Serving never starts a Lit worker; `teardown()` still stops one left from a static export in the same process.

If shutdown rejects while a standalone development restart is stopping the server, the adapter logs the rejection details, including nested cleanup errors and their causes, and still exits with the restart code: the process ends either way, and the CLI starts a fresh server.

They are not responsible for:

- deciding plugin lifecycle ordering
- owning server-module semantics
- owning browser bundling policy
- owning route rendering semantics

## Main Areas

- `node/`: `EcopagesApp`, concrete `NodeServerAdapter`, watch-only `DevSession`, HTTP request bridge, and HMR transport
- `shared/`: runtime-neutral adapter helpers, clustered by concern:
    - `shared/http/` — API response builders, the shared `serveDistFile()` request handler, middleware runner, define-api helpers, explicit-static and filesystem matchers, and the endpoint file handler. The dist handler owns file lookup, path validation, HEAD and 405 behavior, ETags, conditional 304, gzip negotiation, and `Cache-Control` for both the runtime fallback and preview. It never serves the private `dist/.server/` directory, including encoded path segments. In watch mode stable non-HTML files use `no-cache`; in production only recorded content-hashed outputs are `immutable`, and `.html` and every other file is revalidated (`public, max-age=0, must-revalidate`). A `.gz` variant is sent only to a client that accepts gzip, and any gzip-eligible file that has one carries `Vary: Accept-Encoding`. `FileSystemServerResponseFactory` only wraps rendered route and error-page bodies.
    - `shared/hmr/` — HMR HTML inject helpers, concrete `HmrManager`, and entrypoint registrar. `HmrManager` assigns `appRuntime.hmr` for the dev session, owns per-session script entrypoint change handlers (`onScriptEntrypointChanged`), and clears both on `stop()`. Missing-file events are skipped and their entrypoint registrations are cleared. In watch mode every HTML response is marked `no-store`
- `shared/runtime/` — `ServerRequestPipeline`, route handler, static builder, port/bootstrap utilities (`PortManager` on dev and preview bind, Clack confirm on TTY port collisions), and the public asset copy helper used at startup, during static export, and by the watcher. Serve-only preview reads `dist/` and does not copy the source public directory. Preview binds `serveDistFile()` through the same `RuntimeHost` transport used by the app server. The host resolves the hostname and listens on its first address on every runtime, so a port already taken on that address is reported as in use (and falls back or fails) under Bun as well as Node. Before `EcopagesApp.start()` reports readiness, watch mode waits for best-effort Integration warmup attempts and the watcher's initial filesystem subscription; all warmup attempts settle before failures are logged. Non-watch network startup activates Integrations before releasing request readiness. In production, startup also restores listed route browser graphs from the production build manifest and checks that listed output files exist. Request-only `app.fetch()` activates only Integrations used by the request. Watch mode wraps each request and Page prewarm in the build-queue request scope and records build inputs on the app's build-input index. Non-watch requests run without those scopes. Declared prewarm paths (`devPrewarmPaths`, including those Processors append in `setup()`) are de-duplicated and rendered in the background without delaying readiness; a path that fails to render is skipped and logged at debug level.
    - `shared/ws/` — WinterCG WebSocket lifecycle helpers and Node HTTP upgrade bridge

## Ownership Boundary

The adapter layer is transport-oriented.

Core-owned modules still own:

- config finalization
- build-manifest assembly
- server loading
- invalidation classification
- route rendering orchestration

The error-pages module owns semantic error-page source selection and rendering. The filesystem response matcher classifies page failures, logs rendering failures, coordinates built-in fallback, and wraps the final body in an HTTP response.

## Shared Request Contracts

- API handler errors and errors that escape `ServerRequestPipeline.handleSharedRequest` resolve through `ApiRequestPipeline.handleError`: a thrown `Response`, then a client abort (499), then `app.onError`, then `HttpError`, then a 500 logged with its stack. `app.fetch()` therefore always resolves with a `Response`. Page render failures render the error page instead and do not reach `app.onError`.
- Request order is Explicit Routes (`apiHandlers`), then `app.static` routes, then the Route Registry match. Endpoint files never join `apiHandlers`.
- An endpoint match loads the file through the server-module loader Pages use. Production imports the module `ecopages build` emitted; a dev save drops the cached module. It picks the export named after the request method and runs it with the registry's Params through `ApiRequestPipeline.execute`, so schemas, middleware and `app.onError` behave as for an Explicit Route. A dev prewarm of an endpoint path passes `app.onError` too.
- An endpoint load error (no method export, or a method export that is not a handler, is built for another method, or sets `path`) fails `ServerStaticBuilder.build()` after the server bundle is published and server modules are emitted, and before static generation. It is checked again on every request, since dev edits files between requests, and resolves through `ApiRequestPipeline.handleError`. A method the file does not export answers 405 with an `Allow` header in `API_HANDLER_METHODS` order.
- An Explicit Route on an endpoint's pathname logs one warning per registration and file pair. Each registry init checks, including a dev route refresh, and a pair already warned about is not repeated.
- On Node, `attachNodeHttpWebSocketUpgrades` owns the unmatched-upgrade policy. `/_hmr` (dev only) and user routes are handled; anything else is destroyed.
- The production build bundles the server entry when the app registers an Explicit Route or a WebSocket handler (`ServerStaticBuilderParams.needsServerBundle`, decided at adapter construction) or when the scanned Route Registry holds an endpoint Template Route (decided in `ServerStaticBuilder.build()`, which receives the registry, so the pages directory is scanned once).
- HMR endpoints follow the `dev` flag only.
