---
'@ecopages/core': minor
---

### Breaking Changes

`HtmlTransformerService` no longer stores queued dependencies. Subclasses that used `setProcessedDependencies()`, `setPagePackage()`, `getProcessedDependencies()`, or `getPagePackage()` must keep render state themselves and pass it to `transform(response, { pagePackage, contributions })`. Replace `transformHtml(html, contributions, pagePackage)` calls with `injectPageAssets(html, { pagePackage, contributions })`. The second argument to `transform()` is now a `PageAssetInjection` object instead of the contributions array.

Pages of one integration can render at the same time because each render keeps its own async context, assets, and foreign-renderer cache.

Route params and query remain authoritative over extra page props. Disabling Page Browser Graph caching for one render also bypasses both cached records and in-flight graph builds.

Page-owned stylesheet and module-script bundles preserve declaration order around files that use custom attributes.

Each Integration now lazily owns one renderer shared by route renders, explicit views, and foreign-child handoffs.

Static export uses the metadata returned by each rendered route for sitemap eligibility instead of loading the page again.
