---
'@ecopages/core': minor
---

Build content collection server modules through the app's route-module build queue, and delete code only tests reached.

Collection server builds now share the concurrency limit and in-flight deduplication of the app's other route-module builds instead of running on an unbounded standalone Rolldown adapter.

**Breaking:** `@ecopages/core` removes the lazy `scripts-injector` wrapper that nothing emitted. The `ResolvedLazyScriptGroup` type and the `_resolvedLazyScripts` component config field are gone; lazy scripts load through the page-level injector map and each component's `data-eco-trigger` attribute, which is unchanged. Remove any reference to the type or the field.

**Breaking (continued):** test-only members are gone from `@ecopages/core`. `AssetProcessingService` no longer has `clearCache()` or `getRegistry()` and `invalidateCacheForFile()` is private; the service already evicts assets when a build input changes. `PageCacheService` no longer has `generateCacheKey()`, `getDependencyIndex()` or `getStore()`. `ForeignSubtreeExecutionService` no longer has `createFailFastRuntime()`. `StaticSiteGenerator` no longer has `isRootDir()`. `@ecopages/core/diagnostics/request-pipeline-metrics` no longer exports `resetRequestPipelineMetrics`, `@ecopages/core/plugins/package-specifier` no longer exports `isSubpathOfPackageRoot`, and `@ecopages/core/route-renderer/page-loading/file-scoped-dependency-components` no longer exports `splitPageDependenciesResult`. A test that needs isolation should create a fresh app config or service per test instead of resetting shared state.
