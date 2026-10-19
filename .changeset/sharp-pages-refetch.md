---
'@ecopages/browser-router': patch
---

Fix `prefetch: false` serving stale pages. With prefetching disabled, every navigation now fetches fresh HTML instead of reusing the first copy of a page for the rest of the session. The README no longer claims the prefetch cache is shared with `@ecopages/react-router`.
