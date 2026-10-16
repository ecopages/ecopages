---
'@ecopages/core': minor
---

`createApp()` now returns the concrete `EcopagesApp`, which owns route registration and the Node HTTP server lifecycle. Command-line options are resolved once when the app is created. Concurrent startup and request-only calls share initialization, and `fetch()` after `stop()` initializes a fresh server adapter.

### Breaking Changes

The exported `UniversalEcopagesApp` and `ResolvedEcopagesAppOptions` types have been removed. Use `EcopagesApp` and `EcopagesAppOptions` from `@ecopages/core/create-app`.

The adapter internals `AbstractServerAdapter`, `ServerAdapterOptions`, `ServerAdapterResult`, and `NodeServerAdapterResult`, along with the `createAdapter()` facade, have been removed. Use `createApp()` for the supported application API. Custom `IHmrManager` implementations must implement `tryHandleDevClientRequest(request)` and return a response or `null`.
