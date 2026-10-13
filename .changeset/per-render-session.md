---
'@ecopages/core': minor
---

### Breaking Changes

`HtmlTransformerService` no longer stores queued dependencies. Subclasses that used `setProcessedDependencies()`, `setPagePackage()`, `getProcessedDependencies()`, or `getPagePackage()` must keep render state themselves and pass it to `transform(response, { pagePackage, contributions })`. Replace `transformHtml(html, contributions, pagePackage)` calls with `injectPageAssets(html, { pagePackage, contributions })`. The second argument to `transform()` is now a `PageAssetInjection` object instead of the contributions array.

Pages of one integration can render at the same time when async context storage is available. Each render keeps its own assets and foreign-renderer cache.
