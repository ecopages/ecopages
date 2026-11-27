---
'@ecopages/core': patch
---

`ecopages build` also emits the server bundle when the app's `cache.defaultStrategy` is `'dynamic'` or a revalidating strategy and a Page, an HTML Page included, declares no `cache` of its own. Such a Page is rendered on request, so an app with no Endpoint built a static-only `dist/` that `ecopages start` refused.
