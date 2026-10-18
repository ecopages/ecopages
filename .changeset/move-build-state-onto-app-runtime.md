---
'@ecopages/core': minor
'@ecopages/content-processor': patch
---

Move build-side per-app state (build adapter, sealed build manifest, build queue, build-input dependency index, unified pages graph manifest, route-module build caches, and collection server build artifacts) onto `AppRuntime`, and remove fallback adapter and manifest creation when a config has not been assembled.

**Breaking:** `getAppBuildOwnership`, `getAppBuildAdapter`, `setAppBuildAdapter`, `getAppBuildManifest`, and `setAppBuildManifest` are removed from `@ecopages/core/build/build-adapter`, and `getBuildQueue` is removed from `@ecopages/core/build/build-queue`. Read `buildAdapter`, `buildManifest`, and `buildQueue` from `requireAppRuntime(appConfig)` (or `requireBuildQueue(appConfig)`), and pass a finalized `EcoPagesAppConfig` to build services.
