---
'@ecopages/browser-router': patch
'@ecopages/core': patch
---

The browser router no longer serves a page from its navigation cache when the response was sent with `Cache-Control: no-store` or an unqualified `no-cache`, such as a `cache: 'dynamic'` Page. It fetches that page on every navigation, back and forward included. `fetchNavigationPage()` in `@ecopages/core/client` follows the same rule for custom navigation runtimes: it returns such a page without caching it and drops any copy held for its URLs. Hovering a link to such a page still prefetches it once. The document the router starts on is no longer cached, because its response headers cannot be read; the first return to it fetches the page.
