---
'@ecopages/core': minor
---

Remove navigation coordinator and HMR manager members that nothing called.

**Breaking:** `EcoNavigationRuntime` no longer has `setOwner`, `isOwnedByAnotherRuntime`, `subscribe` or `cleanupCurrentOwner`, and `@ecopages/core/router/navigation-coordinator` no longer exports `EcoNavigationRuntimeEvent` or `EcoNavigationRuntimeListener`. Call `claimOwnership` instead of `setOwner`, compare `getOwnerState().owner` with your own name instead of `isOwnedByAnotherRuntime`, call `cleanupOwner(getOwnerState().owner)` instead of `cleanupCurrentOwner`, and read `getOwnerState()` when you need the current owner; there is no replacement for change events. `IHmrManager` no longer has `getOutputUrl`, `getRuntimeWorkDir` or `getRuntimePath`; read an entrypoint's URL from `getRegisteredEntrypoints().get(path)?.outputUrl`, or use the `outputUrl` that `registerEntrypoint` and `registerScriptEntrypoint` return. `@ecopages/core/hmr/hmr-entrypoint-output` no longer exports `ResolvedHmrEntrypoint` or `HmrEntrypointRole`; import `ResolvedHmrEntrypoint` from `@ecopages/core`.
