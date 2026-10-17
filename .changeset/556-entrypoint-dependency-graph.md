---
'@ecopages/core': minor
---

**Breaking:** `AppRuntime.entrypointDependencyGraph` and `supportsSelectiveInvalidation()` are removed. The HMR manager now owns the dependency graph. Custom HMR contexts only need to expose `getDependencyEntrypoints()`; the manager records and clears dependency edges itself.
