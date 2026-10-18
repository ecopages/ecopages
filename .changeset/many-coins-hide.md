---
'@ecopages/core': minor
---

Dispatch every HMR-eligible file in a save batch through one call, so strategies can preserve client state when the changes support it. A batch hot-updates every island it touches instead of reloading, and an edit to an include file or an explicit view now refreshes the page in place when the navigation runtime is available instead of reloading it. A file that fails to process no longer drops the rest of its batch.

**Breaking:** `HmrManager.handleFileChanges(paths, options)` is now required. A custom HMR manager must implement it; the watcher no longer falls back to calling `handleFileChange` once per file.
