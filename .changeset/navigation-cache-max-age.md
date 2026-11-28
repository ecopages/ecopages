---
'@ecopages/browser-router': patch
'@ecopages/core': patch
---

Stop reusing a `{ revalidate: N }` page for the whole session. The navigation cache now stores the fetch time with each document and treats a copy older than the positive `max-age` of its response as missing, so the next navigation fetches it again. A page sent with `max-age=0` (a static page) or with no `max-age` is still reused for the session.
