---
'@ecopages/browser-router': minor
'@ecopages/core': minor
---

Use a hover prefetch of a `no-store` page for the click that follows. Pages that forbid reuse (a cart, an order, any Dynamic Page) were rendered twice, once for the prefetch and once for the click. The router now keeps the prefetched response for five seconds and uses it once, so a hover and a click request the page once, even when the click comes before the prefetch has finished; a second click, or a click after the five seconds, fetches again, so a copy is never served stale. `fetchNavigationPage()` takes a `prefetch` option for this.
