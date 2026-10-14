---
'@ecopages/core': minor
---

Assemble one app runtime when a config is finalized. A config that skipped finalization has no runtime.

**Breaking:** `RouteRendererFactory` now requires `runtime`. Import `requireAppRuntime` from `@ecopages/core/config/app-runtime` and pass `requireAppRuntime(appConfig)`.
