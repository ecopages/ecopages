---
'@ecopages/core': minor
---

`createApp()` now returns the concrete `EcopagesApp`, which owns route registration and the Node HTTP server lifecycle. Command-line options are resolved once when the app is created.

### Breaking Changes

The exported `UniversalEcopagesApp` and `ResolvedEcopagesAppOptions` types have been removed. Use `EcopagesApp` and `EcopagesAppOptions` from `@ecopages/core/create-app`.
