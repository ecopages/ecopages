---
'@ecopages/browser-router': patch
'@ecopages/core': patch
---

Stop reusing a `{ revalidate: N }` page for the whole session. The navigation cache now expires a page after the positive `max-age` of its response, so the next navigation fetches it again, and counts the `Age` header of a shared cache against it. A page sent with `max-age=0` (a Static Page) or with no `max-age` is still reused for the session. `cacheNavigationHtml()` takes an optional `{ maxAge }` as its fourth argument.
