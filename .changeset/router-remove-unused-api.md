---
'@ecopages/browser-router': patch
---

The unused `DomSwapper` and `BrowserRouterNavigateOptions` exports are removed. The README no longer promises a background refresh of cached pages, which never ran: a revisit renders the cached HTML and the copy is kept for the session.
