---
'@ecopages/browser-router': patch
---

Refresh the cached copy of the page you are on in the background, as the README describes. A revisit now renders cached HTML immediately and the cache is replaced with fresh HTML shortly after, where before it was never refreshed. The unused `DomSwapper` and `BrowserRouterNavigateOptions` exports are removed.
