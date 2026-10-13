---
'@ecopages/browser-router': minor
---

Add a `reloadDocument` option to the browser router. It receives the URL whenever the router hands a navigation back to the browser as a full page load: a cross-origin or static asset target of `navigate()`, a `before-swap` listener calling `reload()`, a document owned by a runtime that cannot take over, and a failed fetch or swap. The default is `window.location.assign`, so existing behaviour is unchanged.
