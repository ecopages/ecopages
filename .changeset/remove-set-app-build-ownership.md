---
'@ecopages/core': minor
---

An app's build ownership now comes only from its installed build adapter.

**Breaking:** `setAppBuildOwnership()` is removed from `@ecopages/core/build/build-adapter`. Register the adapter with `setAppBuildAdapter(appConfig, createBuildAdapter())` instead.
