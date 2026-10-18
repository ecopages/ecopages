---
'@ecopages/core': minor
---

**Breaking:** `AppRuntime.moduleLoader.importModule()` no longer accepts `rootDir` or `buildExecutor`; imports always use the finalized app configuration and its build queue.
