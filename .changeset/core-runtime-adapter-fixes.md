---
'@ecopages/core': patch
---

Runtime adapter fixes:

- Bun `start` no longer boots `Bun.serve` in `development` mode or exposes `/_hmr`; both now follow `--dev` only.
- `app.onError` now receives errors that escape the request pipeline on Node as well as Bun. As on Bun, `app.fetch()` on Node now resolves with the resulting response instead of rejecting, so an embedding host such as Vite no longer receives these errors in its own error middleware.
- Unhandled request errors are logged with their stack trace instead of a one-line message.
- A client that disconnects mid-request on Node gets a 499 wherever the abort surfaces, including inside API handlers. It is no longer logged as an error or passed to `app.onError`.
- Bun's last-resort `error` hook answers with a plain 500 instead of rendering the not-found page.
- On Node, `attachWebSocketUpgrades(server, { passthroughUnmatched: true })` now honours the option on the first call, so an embedded host such as Vite keeps its own WebSocket upgrades (for example Vite HMR).
- The Bun preview server answers missing pages with status 404, serves `404.html` with that status, no longer throws when `404.html` is absent, and binds the configured hostname.
- Dev file-change errors are broadcast to the browser once instead of twice, and non-`Error` throws are logged instead of dropped.
- A duplicate source transform name now reports a source-transform error instead of a loader error.
- Removed unused API:
    - the unawaited `clearOutput` app option
    - the app getters `getApiHandlers()`, `getStaticRoutes()`, `getWebsocketHandlers()` and `getErrorHandler()`
    - the deprecated `StartCallback`, `ListenCallback`, `ApplicationListeningCallback` and `ApplicationListeningInfo` types from `@ecopages/core/create-app`; use `OnAppStartCallback` and `AppStartInfo`
    - `BunEcopagesApp.completeInitialization()`
    - the never-read `integrationsDependencies` app config field
