---
'@ecopages/core': minor
'@ecopages/ecopages-jsx': patch
'@ecopages/lit': patch
'@ecopages/content-processor': patch
---

Move render and development per-app state (Page Browser Graph session, page cache, server invalidation state, entrypoint dependency graph, module loader, integration activation map, runtime asset preparation state, HTML Page module-script state, and registered script entrypoint change handlers) onto `AppRuntime`, delete the remaining per-config `WeakMap`/`WeakSet` stores and `getApp*`/`setApp*`/`registerApp*` accessors, and remove `runtime` from `EcoPagesAppConfig`.

**Breaking:** `EcoPagesAppConfig.runtime` is removed. Read and update per-app runtime state through `requireAppRuntime(appConfig)` from `@ecopages/core/config/app-runtime`, and pass a finalized `EcoPagesAppConfig` to core render, cache, and development services.
