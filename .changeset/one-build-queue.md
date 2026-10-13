---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/content-processor': patch
---

Every build the app's own build pipeline runs goes through one queue with three lanes: `build` (all cores but one), `hmr` (at most three) and `nested` (for a build that a running build waits for, such as a content collection bundle requested from a plugin hook, so it cannot wait for a slot its parent holds). A build the app does not own, such as the React hydration script compiler's, and a page module import with no app config, stay outside it. A build identical to one that is queued or running is shared, and so is a finished one within the same request, so the per-request build cache and the separate in-flight wrapper are gone. Server-entry builds use the `build` lane instead of running alone.

**Breaking:** `@ecopages/core/build/build-runtime` is now `@ecopages/core/build/build-queue`. `installBuildRuntime` and `requireBuildRuntime` become `installBuildQueue` and `requireBuildQueue`, `appConfig.runtime.buildRuntime` becomes `appConfig.runtime.buildQueue`, `getProfile(...)` is replaced by `buildQueue.build(options, 'build' | 'hmr' | 'nested')`, and `disposeAppBuildRuntime` is removed because the queue holds nothing to release. `BrowserBundleOptions.executor` is removed; the lane follows the bundle's `profile`.
