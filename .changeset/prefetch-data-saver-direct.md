---
'@ecopages/browser-router': patch
---

Respect `respectDataSaver` on every prefetch path. `router.prefetch(href)` and eager links found after a navigation used to request pages on a Save-Data or 2g connection, because only the start-up path checked; the check now lives in `PrefetchManager.prefetch()`.
