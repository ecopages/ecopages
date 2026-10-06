---
'@ecopages/core': minor
---

Remove dev host helpers that nothing calls since the Vite plugin left dev invalidation to the embedded app.

**Breaking:** the `@ecopages/core/dev/hmr-manager-registry`, `@ecopages/core/hmr/hmr-file-change-prep` and `@ecopages/core/dev/dev-client-ownership` subpaths are gone, and the runtime from `createDevelopmentHostRuntime()` (`@ecopages/core/dev/host-runtime`) now only has `registerHostModuleLoader()`; `createDevelopmentHostRuntime()` takes no arguments. `planFileChange()`, `invalidateServerModules()`, `broadcastClientEvent()` and `isServerRenderedTemplatePlan()` have no replacement: the embedded app's watcher invalidates and reloads on its own.
