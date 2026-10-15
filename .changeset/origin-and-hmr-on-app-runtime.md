---
'@ecopages/core': minor
'@ecopages/ecopages-jsx': patch
'@ecopages/lit': patch
---

Read runtime `origin` and `hmr` directly from `AppRuntime`, remove `RouteRendererFactory.setRuntimeOrigin()`, `IntegrationPlugin.setRuntimeOrigin()`, and mutable `runtimeOrigin` copies across adapters, route renderers, and integrations, and register script-entrypoint change handlers on the per-session HMR manager (`IHmrManager.onScriptEntrypointChanged`) instead of `AppRuntime`.

**Breaking:** `IntegrationPlugin.setRuntimeOrigin()`, `IntegrationPlugin.runtimeOrigin`, `RouteRendererFactory.setRuntimeOrigin()`, `RouteRendererFactory.runtimeOrigin`, `IntegrationRendererOptions.runtimeOrigin`, the `runtimeOrigin` constructor option on `RouteRendererFactory`, `ServerAdapterOptions`, `NodeServerAdapterParams`, and `ServerStaticBuilderParams`, and `AppRuntime.registeredScriptEntrypointChangeHandlers` are removed. Read and update the active origin through `requireAppRuntime(appConfig).origin`, read the active HMR manager from `requireAppRuntime(appConfig).hmr`, and register script-entrypoint change handlers via `hmrManager.onScriptEntrypointChanged(handler)`.
