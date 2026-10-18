---
'@ecopages/core': minor
---

Centralize asset processing state in `AssetProcessingService` and pass Integration ownership explicitly.

**Breaking:** `AssetProcessingService.processDependencies()` now accepts the owning Integration object or `undefined` instead of a string processing key. Update callers to pass the Integration instance as the second argument, or pass `undefined` for app-wide processing.
