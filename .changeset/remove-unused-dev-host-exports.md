---
'@ecopages/core': minor
---

Remove dev host helpers that nothing calls.

**Breaking:** the `@ecopages/core/dev/hmr-manager-registry`, `@ecopages/core/hmr/hmr-file-change-prep` and `@ecopages/core/dev/dev-client-ownership` subpaths are gone. `planFileChange()`, `invalidateServerModules()`, `broadcastClientEvent()` and `isServerRenderedTemplatePlan()` have no replacement.
