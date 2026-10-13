---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/content-processor': patch
---

Every build of an app goes through one queue with two lanes, `build` (all cores but one) and `hmr` (at most three). A build identical to one that is queued or running is shared, and so is a finished one within the same request, so the per-request build cache and the separate in-flight wrapper are gone. Server-entry builds use the `build` lane instead of running alone.

**Breaking:** `@ecopages/core/build/build-runtime` is now `@ecopages/core/build/build-queue`. `installBuildRuntime` and `requireBuildRuntime` become `installBuildQueue` and `requireBuildQueue`, `appConfig.runtime.buildRuntime` becomes `appConfig.runtime.buildQueue`, `getProfile(...)` is replaced by `buildQueue.build(options, 'build' | 'hmr')`, and `disposeAppBuildRuntime` is removed because the queue holds nothing to release. `BrowserBundleOptions.executor` is removed; the lane follows the bundle's `profile`.
