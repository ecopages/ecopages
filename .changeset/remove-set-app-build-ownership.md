---
'@ecopages/core': minor
---

Remove `setAppBuildOwnership()` from `@ecopages/core/build/build-adapter`. An app's build ownership now comes only from its installed build adapter, so install one with `setAppBuildAdapter(appConfig, createBuildAdapter({ ownership: 'vite-host' }))` instead.
